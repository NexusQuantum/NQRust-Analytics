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

// Coerce arbitrary thrown values (Axios errors, GraphQLError, plain
// objects, strings) into the shape declared by the GraphQL Error type
// (code, shortMessage, message, stacktrace). Writing the raw value
// trashes the row: Apollo can't serialize fields like `config` /
// nested `originalError` against a String-typed schema, and the entire
// thread fetch fails when that row is touched.
function normalizeAnswerError(raw: any): {
  code: string | null;
  shortMessage: string | null;
  message: string;
  stacktrace: string[];
} | null {
  if (raw == null) return null;
  // Unwrap a common wrapper: some callers re-throw as { originalError }.
  const e = raw.originalError ?? raw;
  const stack = typeof e?.stack === 'string'
    ? e.stack.split('\n').map((s: string) => s.trim()).slice(0, 12)
    : Array.isArray(e?.stacktrace)
      ? e.stacktrace.filter((s: any) => typeof s === 'string')
      : [];
  return {
    code: typeof e?.code === 'string' ? e.code : null,
    shortMessage: typeof e?.shortMessage === 'string' ? e.shortMessage : null,
    message:
      typeof e?.message === 'string' && e.message
        ? e.message
        : typeof raw === 'string'
          ? raw
          : 'Unknown error',
    stacktrace: stack,
  };
}

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

          // Wrap the whole job in try/finally so cleanup (delete from
          // tasks + runningJobs) always happens. Without this, a thrown
          // error in the preview/AI flow left the task in both maps
          // forever — the next tick saw it in runningJobs and skipped,
          // so failed responses were never retried *or* cleared.
          try {
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
              await this.threadResponseRepository.updateOne(threadResponse.id, {
                answerDetail: {
                  ...threadResponse.answerDetail,
                  status: ThreadResponseAnswerStatus.FAILED,
                  error: normalizeAnswerError(error?.extensions || error),
                },
              });
              throw error;
            }

            // request AI service
            const response = await this.analyticsAIAdaptor.createTextBasedAnswer({
              query: threadResponse.question,
              sql: threadResponse.sql,
              sqlData: data,
              threadId: threadResponse.threadId.toString(),
              configurations: {
                language:
                  AnalyticsAILanguage[project.language] ||
                  AnalyticsAILanguage.EN,
              },
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
              error: normalizeAnswerError(result.error),
            };
            await this.threadResponseRepository.updateOne(threadResponse.id, {
              answerDetail: updatedAnswerDetail,
            });
          } finally {
            delete this.tasks[threadResponse.id];
            this.runningJobs.delete(threadResponse.id);
          }
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
