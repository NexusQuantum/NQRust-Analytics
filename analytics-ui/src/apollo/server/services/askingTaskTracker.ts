import { getLogger } from '@server/utils';
import {
  AskResult,
  AskResultType,
  AskResultStatus,
  AskInput,
} from '@server/models/adaptor';
import {
  AskingTask,
  IAskingTaskRepository,
  IThreadResponseRepository,
  IViewRepository,
} from '@server/repositories';
import { IAnalyticsAIAdaptor } from '../adaptors';
import * as Errors from '@server/utils/error';

const logger = getLogger('AskingTaskTracker');
logger.level = 'debug';

interface TrackedTask {
  queryId: string;
  taskId?: number;
  lastPolled: number;
  question?: string;
  result?: AskResult;
  isFinalized: boolean;
  threadResponseId?: number;
  rerunFromCancelled?: boolean;
}

export type TrackedAskingResult = AskResult & {
  taskId?: number;
  queryId: string;
  question: string;
};

export type CreateAskingTaskInput = AskInput & {
  rerunFromCancelled?: boolean;
  previousTaskId?: number;
  threadResponseId?: number;
};

export interface IAskingTaskTracker {
  createAskingTask(input: CreateAskingTaskInput): Promise<{ queryId: string }>;
  getAskingResult(queryId: string): Promise<TrackedAskingResult | null>;
  getAskingResultById(id: number): Promise<TrackedAskingResult | null>;
  cancelAskingTask(queryId: string): Promise<void>;
  bindThreadResponse(
    id: number,
    queryId: string,
    threadId: number,
    threadResponseId: number,
  ): Promise<void>;
}

export class AskingTaskTracker implements IAskingTaskTracker {
  private analyticsAIAdaptor: IAnalyticsAIAdaptor;
  private askingTaskRepository: IAskingTaskRepository;
  private trackedTasks: Map<string, TrackedTask> = new Map();
  private trackedTasksById: Map<number, TrackedTask> = new Map();
  private pollingInterval: number;
  private memoryRetentionTime: number;
  private pollingIntervalId: NodeJS.Timeout;
  private runningJobs = new Set<string>();
  private threadResponseRepository: IThreadResponseRepository;
  private viewRepository: IViewRepository;
  // Optional callback fired after a TEXT_TO_SQL task is finalized & bound,
  // so the askingService can auto-kick off text-based answer generation
  // without waiting for the client to call the mutation.
  private onTextToSqlFinalized?: (threadResponseId: number) => Promise<void>;

  constructor({
    analyticsAIAdaptor,
    askingTaskRepository,
    threadResponseRepository,
    viewRepository,
    pollingInterval = 1000, // 1 second
    memoryRetentionTime = 5 * 60 * 1000, // 5 minutes
  }: {
    analyticsAIAdaptor: IAnalyticsAIAdaptor;
    askingTaskRepository: IAskingTaskRepository;
    threadResponseRepository: IThreadResponseRepository;
    viewRepository: IViewRepository;
    pollingInterval?: number;
    memoryRetentionTime?: number;
  }) {
    this.analyticsAIAdaptor = analyticsAIAdaptor;
    this.askingTaskRepository = askingTaskRepository;
    this.threadResponseRepository = threadResponseRepository;
    this.viewRepository = viewRepository;
    this.pollingInterval = pollingInterval;
    this.memoryRetentionTime = memoryRetentionTime;
    this.startPolling();
  }

  public setOnTextToSqlFinalized(
    cb: (threadResponseId: number) => Promise<void>,
  ): void {
    this.onTextToSqlFinalized = cb;
  }

  public async createAskingTask(
    input: CreateAskingTaskInput,
  ): Promise<{ queryId: string }> {
    try {
      // Call the AI service to create a task
      const response = await this.analyticsAIAdaptor.ask(input);
      const queryId = response.queryId;

      // validate the input
      if (
        input.rerunFromCancelled &&
        (!input.previousTaskId || !input.threadResponseId)
      ) {
        throw new Error(
          'Previous task id and thread response id are required if rerun from cancelled',
        );
      }

      // Start tracking this task
      const task = {
        queryId,
        lastPolled: Date.now(),
        question: input.query,
        isFinalized: false,
        rerunFromCancelled: input.rerunFromCancelled,
      } as TrackedTask;
      this.trackedTasks.set(queryId, task);

      // if rerun from cancelled, we update the query id to the previous task
      if (
        input.rerunFromCancelled &&
        input.previousTaskId &&
        input.threadResponseId
      ) {
        // set the thread response id in memory to bind the task to the thread response
        // we don't have to update to database here because the thread response id is already set in database
        task.threadResponseId = input.threadResponseId;

        // update the task id in memory
        this.trackedTasksById.set(input.previousTaskId, task);

        // get the latest result from the AI service
        // we get the latest result first to make it more responsive to client-side
        const result = await this.analyticsAIAdaptor.getAskResult(queryId);

        // update the result in memory
        task.result = result;

        // update the query id in database
        await this.askingTaskRepository.updateOne(input.previousTaskId, {
          queryId,
        });
      }

      logger.info(`Created asking task with queryId: ${queryId}`);
      return { queryId };
    } catch (err) {
      logger.error(`Failed to create asking task: ${err}`);
      throw err;
    }
  }

  public async getAskingResult(
    queryId: string,
  ): Promise<TrackedAskingResult | null> {
    // Check if we're tracking this task in memory
    const trackedTask = this.trackedTasks.get(queryId);

    if (trackedTask && trackedTask.result) {
      return {
        ...trackedTask.result,
        queryId,
        question: trackedTask.question,
        taskId: trackedTask.taskId,
      };
    }

    // If not in memory or no result yet, check the database
    return this.getAskingResultFromDB({ queryId });
  }

  public async getAskingResultById(
    id: number,
  ): Promise<TrackedAskingResult | null> {
    const task = this.trackedTasksById.get(id);
    if (task) {
      return this.getAskingResult(task.queryId);
    }

    return this.getAskingResultFromDB({ taskId: id });
  }

  public async cancelAskingTask(queryId: string): Promise<void> {
    await this.analyticsAIAdaptor.cancelAsk(queryId);
  }

  public stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
    }
  }

  public async bindThreadResponse(
    id: number,
    queryId: string,
    threadId: number,
    threadResponseId: number,
  ): Promise<void> {
    let task = this.trackedTasks.get(queryId);

    // Memory cache evicts tasks after memoryRetentionTime since last poll.
    // For long flows (e.g. complex recommended question → follow-up), the
    // in-memory task may already be gone by the time the UI binds the
    // thread response. Reconstruct from the persisted asking_task row so
    // we can still update the DB and (best-effort) trigger downstream work.
    if (!task) {
      const dbRecord = await this.askingTaskRepository.findOneBy({
        queryId,
      } as Partial<AskingTask>);
      if (!dbRecord) {
        throw new Error(`Task ${queryId} not found`);
      }
      const detail = (dbRecord.detail as AskResult | undefined) ?? undefined;
      task = {
        queryId,
        taskId: dbRecord.id,
        lastPolled: Date.now(),
        question: dbRecord.question ?? undefined,
        result: detail,
        isFinalized:
          detail?.status === AskResultStatus.FINISHED ||
          detail?.status === AskResultStatus.FAILED ||
          detail?.status === AskResultStatus.STOPPED,
        threadResponseId,
      };
      this.trackedTasks.set(queryId, task);
      logger.info(
        `Reconstructed evicted task ${queryId} from DB so bindThreadResponse can proceed`,
      );
    }

    task.threadResponseId = threadResponseId;
    this.trackedTasksById.set(id, task);
    await this.askingTaskRepository.updateOne(id, {
      threadId,
      threadResponseId,
    });

    // check if the task is finalized and has a sql
    if (task.isFinalized) {
      await this.updateThreadResponseWhenTaskFinalized(task);
      // Auto-kick text-based answer generation for TEXT_TO_SQL responses so
      // the client doesn't need to coordinate via useEffect race-prone path.
      if (
        task.result?.type === AskResultType.TEXT_TO_SQL &&
        this.onTextToSqlFinalized &&
        threadResponseId
      ) {
        this.onTextToSqlFinalized(threadResponseId).catch((err) =>
          logger.error(
            `Failed to auto-trigger text answer for response ${threadResponseId}: ${err}`,
          ),
        );
      }
    }
  }

  private startPolling(): void {
    this.pollingIntervalId = setInterval(() => {
      this.pollTasks();
    }, this.pollingInterval);
  }

  private async pollTasks(): Promise<void> {
    const now = Date.now();
    const tasksToRemove: string[] = [];

    // Create an array of job functions
    const jobs = Array.from(this.trackedTasks.entries()).map(
      ([queryId, task]) =>
        async () => {
          try {
            // Skip if the job is already running
            if (this.runningJobs.has(queryId)) {
              return;
            }

            // Skip finalized tasks that have been in memory too long
            if (
              task.isFinalized &&
              now - task.lastPolled > this.memoryRetentionTime
            ) {
              tasksToRemove.push(queryId);
              return;
            }

            // Skip finalized tasks
            if (task.isFinalized) {
              return;
            }

            // Mark the job as running
            this.runningJobs.add(queryId);

            // Poll for updates
            logger.info(`Polling for updates for task ${queryId}`);
            const result = await this.analyticsAIAdaptor.getAskResult(queryId);
            task.lastPolled = now;

            // if result is not changed, we don't need to update the database
            if (!this.isResultChanged(task.result, result)) {
              this.runningJobs.delete(queryId);
              return;
            }

            // update task in memory if any change
            task.result = result;

            // if result is still understanding, we don't need to update the database
            if (result.status === AskResultStatus.UNDERSTANDING) {
              this.runningJobs.delete(queryId);
              return;
            }

            // if it's a document-based answer, finalize and persist to thread response
            if (result.type === AskResultType.DOCUMENT_BASED && result.status === AskResultStatus.FINISHED) {
              task.isFinalized = true;
              // persist the final result to asking_task.detail so history loads correctly
              await this.updateTaskInDatabase({ queryId }, task);
              if (task.threadResponseId && result.documentAnswer) {
                await this.threadResponseRepository.updateOne(task.threadResponseId, {
                  documentAnswerDetail: result.documentAnswer as any,
                });
              }
              this.runningJobs.delete(queryId);
              return;
            }

            // if it's identified as GENERAL or MISLEADING_QUERY
            // we don't need to update the database and finalize the task
            if (
              result.type === AskResultType.GENERAL ||
              result.type === AskResultType.MISLEADING_QUERY
            ) {
              task.isFinalized = true;
              // if it's rerun from cancelled, we need to update the task result to failed in db
              if (task.rerunFromCancelled) {
                const errorCode =
                  result.type === AskResultType.GENERAL
                    ? Errors.GeneralErrorCodes.IDENTIED_AS_GENERAL
                    : Errors.GeneralErrorCodes.IDENTIED_AS_MISLEADING_QUERY;
                const error = {
                  code: errorCode,
                  message: Errors.errorMessages[errorCode],
                  shortMessage: Errors.shortMessages[errorCode],
                };
                await this.updateTaskInDatabase(
                  { queryId },
                  {
                    ...task,
                    // update the status to failed
                    // and the error message should be "IDENTIED_AS_GENERAL" or "IDENTIED_AS_MISLEADING_QUERY"
                    result: {
                      ...task.result,
                      status: AskResultStatus.FAILED,
                      error,
                    },
                  },
                );
              }
              this.runningJobs.delete(queryId);
              return;
            }

            // update the database
            // note: type could be null if it's still being understood or it's stopped
            // we already filtered out the understanding status above
            // so we update to database if it's stopped as well here.
            logger.info(`Updating task ${queryId} in database`);
            await this.updateTaskInDatabase({ queryId }, task);

            // Check if task is now finalized
            if (this.isTaskFinalized(result.status)) {
              task.isFinalized = true;
              // update thread response if threadResponseId is provided
              if (task.threadResponseId) {
                await this.updateThreadResponseWhenTaskFinalized(task);
                // Auto-kick text-based answer generation for TEXT_TO_SQL
                if (
                  result.type === AskResultType.TEXT_TO_SQL &&
                  this.onTextToSqlFinalized
                ) {
                  this.onTextToSqlFinalized(task.threadResponseId).catch(
                    (err) =>
                      logger.error(
                        `Failed to auto-trigger text answer for response ${task.threadResponseId}: ${err}`,
                      ),
                  );
                }
              }

              logger.info(
                `Task ${queryId} is finalized with status: ${result.status}`,
              );
            }

            // Mark the job as finished
            this.runningJobs.delete(queryId);
          } catch (err) {
            this.runningJobs.delete(queryId);
            logger.error(err.stack);
            throw err;
          }
        },
    );

    // Run all jobs in parallel
    Promise.allSettled(jobs.map((job) => job())).then((results) => {
      // Log any rejected promises
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.error(`Job ${index} failed: ${result.reason}`);
        }
      });

      // Clean up tasks that have been in memory too long
      if (tasksToRemove.length > 0) {
        logger.info(
          `Cleaning up tasks that have been in memory too long. Tasks: ${tasksToRemove.join(
            ', ',
          )}`,
        );
      }
      for (const queryId of tasksToRemove) {
        this.trackedTasks.delete(queryId);
      }
    });
  }

  private async updateThreadResponseWhenTaskFinalized(
    task: TrackedTask,
  ): Promise<void> {
    const response = task?.result?.response?.[0];
    if (!response) {
      return;
    }
    // if the generated response of asking task is not null, update the thread response
    if (response.viewId) {
      // get sql from the view
      const view = await this.viewRepository.findOneBy({
        id: response.viewId,
      });
      await this.threadResponseRepository.updateOne(task.threadResponseId, {
        sql: view.statement,
        viewId: response.viewId,
      });
    } else {
      await this.threadResponseRepository.updateOne(task.threadResponseId, {
        sql: response?.sql,
      });
    }
  }

  private async getAskingResultFromDB({
    queryId,
    taskId,
  }: {
    queryId?: string;
    taskId?: number;
  }): Promise<TrackedAskingResult | null> {
    let taskRecord: AskingTask | null = null;
    if (queryId) {
      taskRecord = await this.askingTaskRepository.findByQueryId(queryId);
    } else if (taskId) {
      taskRecord = await this.askingTaskRepository.findOneBy({ id: taskId });
    }

    if (!taskRecord) {
      return null;
    }

    return {
      ...(taskRecord?.detail as AskResult),
      queryId: queryId || taskRecord?.queryId,
      question: taskRecord?.question,
      taskId: taskRecord?.id,
    };
  }

  private async updateTaskInDatabase(
    filter: { queryId?: string; taskId?: number },
    trackedTask: TrackedTask,
  ): Promise<void> {
    const { queryId, taskId } = filter;
    let taskRecord: AskingTask | null = null;
    if (queryId) {
      taskRecord = await this.askingTaskRepository.findByQueryId(queryId);
    } else if (taskId) {
      taskRecord = await this.askingTaskRepository.findOneBy({ id: taskId });
    }

    if (!taskRecord) {
      // if record not found, create one
      const task = await this.askingTaskRepository.createOne({
        queryId,
        question: trackedTask.question,
        detail: trackedTask.result,
      });
      // update the task id in memory
      let existingTask: TrackedTask;
      if (queryId) {
        existingTask = this.trackedTasks.get(queryId);
      } else if (taskId) {
        existingTask = this.trackedTasksById.get(taskId);
      }
      if (existingTask) {
        existingTask.taskId = task.id;
      }
      return;
    }

    // update the task
    await this.askingTaskRepository.updateOne(taskRecord.id, {
      detail: trackedTask.result,
    });
  }

  private isTaskFinalized(status: AskResultStatus): boolean {
    return [
      AskResultStatus.FINISHED,
      AskResultStatus.FAILED,
      AskResultStatus.STOPPED,
    ].includes(status);
  }

  private isResultChanged(
    previousResult: AskResult,
    newResult: AskResult,
  ): boolean {
    // check status change
    if (previousResult?.status !== newResult.status) {
      return true;
    }

    return false;
  }
}
