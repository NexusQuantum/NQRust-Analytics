import { IAnalyticsAIAdaptor } from '../adaptors';
import {
  AnalyticsAILanguage,
  TextBasedAnswerResult,
  TextBasedAnswerStatus,
} from '../models/adaptor';
import { ThreadResponse, IThreadResponseRepository } from '../repositories';
import {
  IProjectService,
  IDeployService,
  IQueryService,
  ThreadResponseAnswerStatus,
  PreviewDataResponse,
} from '../services';
import { getLogger } from '@server/utils';

const logger = getLogger('TextBasedAnswerBackgroundTracker');
logger.level = 'debug';

export class TextBasedAnswerBackgroundTracker {
  // tasks is a kv pair of task id and thread response
  private tasks: Record<number, ThreadResponse> = {};
  private intervalTime: number;
  private analyticsAIAdaptor: IAnalyticsAIAdaptor;
  private threadResponseRepository: IThreadResponseRepository;
  private projectService: IProjectService;
  private deployService: IDeployService;
  private queryService: IQueryService;
  private runningJobs = new Set();

  constructor({
    analyticsAIAdaptor,
    threadResponseRepository,
    projectService,
    deployService,
    queryService,
  }: {
    analyticsAIAdaptor: IAnalyticsAIAdaptor;
    threadResponseRepository: IThreadResponseRepository;
    projectService: IProjectService;
    deployService: IDeployService;
    queryService: IQueryService;
  }) {
    this.analyticsAIAdaptor = analyticsAIAdaptor;
    this.threadResponseRepository = threadResponseRepository;
    this.projectService = projectService;
    this.deployService = deployService;
    this.queryService = queryService;
    this.intervalTime = 1000;
    this.start();
  }

  private start() {
    setInterval(async () => {
      const jobs = Object.values(this.tasks).map(
        (threadResponse) => async () => {
          if (
            this.runningJobs.has(threadResponse.id) ||
            !threadResponse.answerDetail
          ) {
            return;
          }
          this.runningJobs.add(threadResponse.id);

          // Skip when there is no SQL to preview (e.g. DOCUMENT_QA / GENERAL
          // intents answer narratively via the AI service streaming endpoint
          // and never produce a SQL statement). Without this guard we send
          // sql=null to Ibis and get a 422 validation error every poll.
          if (!threadResponse.sql) {
            await this.threadResponseRepository.updateOne(threadResponse.id, {
              answerDetail: {
                ...threadResponse.answerDetail,
                status: ThreadResponseAnswerStatus.FINISHED,
              },
            });
            this.runningJobs.delete(threadResponse.id);
            return;
          }

          // update the status to fetching data
          await this.threadResponseRepository.updateOne(threadResponse.id, {
            answerDetail: {
              ...threadResponse.answerDetail,
              status: ThreadResponseAnswerStatus.FETCHING_DATA,
            },
          });

          // get sql data
          const project = await this.projectService.getCurrentProject();
          const deployment = await this.deployService.getLastDeployment(
            project.id,
          );
          const mdl = deployment.manifest;
          let data: PreviewDataResponse;
          try {
            data = (await this.queryService.preview(threadResponse.sql, {
              project,
              manifest: mdl,
              modelingOnly: false,
              limit: 500,
            })) as PreviewDataResponse;
          } catch (error) {
            logger.error(`Error when query sql data: ${error}`);
            // Normalize error shape; Ibis can return message as an object
            // ({ detail: [...] }) which breaks the GraphQL String scalar.
            const rawErr = error?.extensions || error || {};
            const normalizedErr = {
              ...rawErr,
              message:
                typeof rawErr.message === 'string'
                  ? rawErr.message
                  : JSON.stringify(rawErr.message ?? error?.message ?? error),
            };
            await this.threadResponseRepository.updateOne(threadResponse.id, {
              answerDetail: {
                ...threadResponse.answerDetail,
                status: ThreadResponseAnswerStatus.FAILED,
                error: normalizedErr,
              },
            });
            throw error;
          }

          // request AI service — include selectedDocumentIds persisted on
          // the threadResponse.answerDetail when the answer was triggered.
          const persistedDocIds: number[] =
            threadResponse.answerDetail?.selectedDocumentIds ?? [];
          const response = await this.analyticsAIAdaptor.createTextBasedAnswer({
            query: threadResponse.question,
            sql: threadResponse.sql,
            sqlData: data,
            threadId: threadResponse.threadId.toString(),
            configurations: {
              language: AnalyticsAILanguage[project.language] || AnalyticsAILanguage.EN,
            },
            selectedDocumentIds: persistedDocIds,
          });

          // update the status to preprocessing
          await this.threadResponseRepository.updateOne(threadResponse.id, {
            answerDetail: {
              ...threadResponse.answerDetail,
              status: ThreadResponseAnswerStatus.PREPROCESSING,
            },
          });

          // polling query id to check the status
          let result: TextBasedAnswerResult;
          do {
            result = await this.analyticsAIAdaptor.getTextBasedAnswerResult(
              response.queryId,
            );
            if (result.status === TextBasedAnswerStatus.PREPROCESSING) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          } while (result.status === TextBasedAnswerStatus.PREPROCESSING);

          // update the status to final
          const updatedAnswerDetail = {
            queryId: response.queryId,
            status:
              result.status === TextBasedAnswerStatus.SUCCEEDED
                ? ThreadResponseAnswerStatus.STREAMING
                : ThreadResponseAnswerStatus.FAILED,
            numRowsUsedInLLM: result.numRowsUsedInLLM,
            error: result.error,
          };
          await this.threadResponseRepository.updateOne(threadResponse.id, {
            answerDetail: updatedAnswerDetail,
          });

          delete this.tasks[threadResponse.id];

          // Mark the job as finished
          this.runningJobs.delete(threadResponse.id);
        },
      );

      // Run the jobs
      Promise.allSettled(jobs.map((job) => job())).then((results) => {
        // Show reason of rejection
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error(`Job ${index} failed: ${result.reason}`);
          }
        });
      });
    }, this.intervalTime);
  }

  public addTask(threadResponse: ThreadResponse) {
    this.tasks[threadResponse.id] = threadResponse;
  }

  public getTasks() {
    return this.tasks;
  }
}
