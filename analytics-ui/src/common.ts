import { getConfig } from '@server/config';
import { bootstrapKnex } from './apollo/server/utils/knex';
import {
  ProjectRepository,
  ViewRepository,
  DeployLogRepository,
  ThreadRepository,
  ThreadResponseRepository,
  ModelRepository,
  ModelColumnRepository,
  RelationRepository,
  SchemaChangeRepository,
  ModelNestedColumnRepository,
  LearningRepository,
  DashboardItemRepository,
  DashboardRepository,
  SqlPairRepository,
  AskingTaskRepository,
  InstructionRepository,
  ApiHistoryRepository,
  DashboardItemRefreshJobRepository,
  DashboardShareRepository,
  UserRepository,
  StarredDashboardRepository,
  ThreadShareRepository,
  LicenseRepository,
} from '@server/repositories';
import {
  AnalyticsEngineAdaptor,
  AnalyticsAIAdaptor,
  IbisAdaptor,
} from '@server/adaptors';
import {
  DataSourceMetadataService,
  QueryService,
  ProjectService,
  DeployService,
  AskingService,
  MDLService,
  DashboardService,
  AskingTaskTracker,
  InstructionService,
  LicenseService,
} from '@server/services';
import { PostHogTelemetry } from './apollo/server/telemetry/telemetry';
import {
  ProjectRecommendQuestionBackgroundTracker,
  ThreadRecommendQuestionBackgroundTracker,
  DashboardCacheBackgroundTracker,
} from './apollo/server/backgrounds';
import { SqlPairService } from './apollo/server/services/sqlPairService';
import { DocumentService } from './apollo/server/services/documentService';
import {
  DocumentRepository,
  DocumentTreeRepository,
  DocumentSelectionRepository,
} from '@server/repositories';

export const serverConfig = getConfig();

export const initComponents = () => {
  const telemetry = new PostHogTelemetry();
  const knex = bootstrapKnex({
    dbType: serverConfig.dbType,
    pgUrl: serverConfig.pgUrl,
    debug: serverConfig.debug,
    sqliteFile: serverConfig.sqliteFile,
  });

  // repositories
  const projectRepository = new ProjectRepository(knex);
  const deployLogRepository = new DeployLogRepository(knex);
  const threadRepository = new ThreadRepository(knex);
  const threadResponseRepository = new ThreadResponseRepository(knex);
  const viewRepository = new ViewRepository(knex);
  const modelRepository = new ModelRepository(knex);
  const modelColumnRepository = new ModelColumnRepository(knex);
  const modelNestedColumnRepository = new ModelNestedColumnRepository(knex);
  const relationRepository = new RelationRepository(knex);
  const schemaChangeRepository = new SchemaChangeRepository(knex);
  const learningRepository = new LearningRepository(knex);
  const dashboardRepository = new DashboardRepository(knex);
  const dashboardItemRepository = new DashboardItemRepository(knex);
  const dashboardShareRepository = new DashboardShareRepository(knex);
  const starredDashboardRepository = new StarredDashboardRepository(knex);
  const threadShareRepository = new ThreadShareRepository(knex);
  const userRepository = new UserRepository(knex);
  const sqlPairRepository = new SqlPairRepository(knex);
  const askingTaskRepository = new AskingTaskRepository(knex);
  const instructionRepository = new InstructionRepository(knex);
  const apiHistoryRepository = new ApiHistoryRepository(knex);
  const dashboardItemRefreshJobRepository =
    new DashboardItemRefreshJobRepository(knex);
  const licenseRepository = new LicenseRepository(knex);
  const documentRepository = new DocumentRepository({ knexPg: knex });
  const documentTreeRepository = new DocumentTreeRepository({ knexPg: knex });
  const documentSelectionRepository = new DocumentSelectionRepository({ knexPg: knex });

  // license service
  const licenseService = new LicenseService(serverConfig, licenseRepository);
  licenseService.checkLicense().catch((err) => {
    // Non-fatal at startup — will be re-checked on requests
    console.warn('License check failed at startup:', err?.message || err);
  });

  // adaptors
  const analyticsEngineAdaptor = new AnalyticsEngineAdaptor({
    analyticsEngineEndpoint: serverConfig.analyticsEngineEndpoint,
  });
  const analyticsAIAdaptor = new AnalyticsAIAdaptor({
    analyticsAIBaseEndpoint: serverConfig.analyticsAIEndpoint,
  });
  const ibisAdaptor = new IbisAdaptor({
    ibisServerEndpoint: serverConfig.ibisServerEndpoint,
  });

  // services
  const metadataService = new DataSourceMetadataService({
    ibisAdaptor,
    analyticsEngineAdaptor,
  });
  const queryService = new QueryService({
    ibisAdaptor,
    analyticsEngineAdaptor,
    telemetry,
  });
  const deployService = new DeployService({
    analyticsAIAdaptor,
    deployLogRepository,
    telemetry,
  });
  const mdlService = new MDLService({
    projectRepository,
    modelRepository,
    modelColumnRepository,
    modelNestedColumnRepository,
    relationRepository,
    viewRepository,
  });
  const projectService = new ProjectService({
    projectRepository,
    metadataService,
    mdlService,
    analyticsAIAdaptor,
    telemetry,
  });
  const askingTaskTracker = new AskingTaskTracker({
    analyticsAIAdaptor,
    askingTaskRepository,
    threadResponseRepository,
    viewRepository,
  });
  const askingService = new AskingService({
    telemetry,
    analyticsAIAdaptor,
    deployService,
    projectService,
    viewRepository,
    threadRepository,
    threadResponseRepository,
    queryService,
    mdlService,
    askingTaskTracker,
    askingTaskRepository,
  });
  const dashboardService = new DashboardService({
    projectService,
    dashboardItemRepository,
    dashboardRepository,
    dashboardShareRepository,
    userRepository,
    starredDashboardRepository,
  });
  const sqlPairService = new SqlPairService({
    sqlPairRepository,
    analyticsAIAdaptor,
    ibisAdaptor,
  });
  const instructionService = new InstructionService({
    instructionRepository,
    analyticsAIAdaptor,
  });
  // The AI service POSTs document indexing results back to this URL, so it
  // must be reachable *from inside the analytics-service container*. The
  // safest default is the docker service name; falling back to NEXTAUTH_URL
  // is risky because NEXTAUTH_URL is typically a public/host address that
  // containers cannot reach (silent callback failures → docs stuck
  // "indexing"). Log a warning when an explicit value isn't set.
  const explicitCallbackUrl = process.env.CALLBACK_BASE_URL;
  if (!explicitCallbackUrl) {
    console.warn(
      '[document-rag] CALLBACK_BASE_URL is not set — defaulting to ' +
        'http://analytics-ui:3000. If your analytics-ui service is named ' +
        'differently or runs on another port, set CALLBACK_BASE_URL in .env ' +
        'or document indexing callbacks will silently fail.',
    );
  }
  const documentService = new DocumentService({
    documentRepository,
    documentTreeRepository,
    documentSelectionRepository,
    analyticsAIAdaptor,
    config: serverConfig,
    callbackBaseUrl: explicitCallbackUrl || 'http://analytics-ui:3000',
  });

  // background trackers
  const projectRecommendQuestionBackgroundTracker =
    new ProjectRecommendQuestionBackgroundTracker({
      telemetry,
      analyticsAIAdaptor,
      projectRepository,
    });
  const threadRecommendQuestionBackgroundTracker =
    new ThreadRecommendQuestionBackgroundTracker({
      telemetry,
      analyticsAIAdaptor,
      threadRepository,
    });
  const dashboardCacheBackgroundTracker = new DashboardCacheBackgroundTracker({
    dashboardRepository,
    dashboardItemRepository,
    dashboardItemRefreshJobRepository,
    projectService,
    deployService,
    queryService,
  });

  return {
    knex,
    telemetry,

    // repositories
    projectRepository,
    deployLogRepository,
    threadRepository,
    threadResponseRepository,
    viewRepository,
    modelRepository,
    modelColumnRepository,
    relationRepository,
    schemaChangeRepository,
    learningRepository,
    modelNestedColumnRepository,
    dashboardRepository,
    dashboardItemRepository,
    dashboardShareRepository,
    starredDashboardRepository,
    threadShareRepository,
    userRepository,
    sqlPairRepository,
    askingTaskRepository,
    apiHistoryRepository,
    instructionRepository,
    dashboardItemRefreshJobRepository,
    licenseRepository,
    documentRepository,
    documentTreeRepository,
    documentSelectionRepository,

    // adaptors
    analyticsEngineAdaptor,
    analyticsAIAdaptor,
    ibisAdaptor,

    // services
    metadataService,
    projectService,
    queryService,
    deployService,
    askingService,
    mdlService,
    dashboardService,
    sqlPairService,
    instructionService,
    documentService,
    askingTaskTracker,
    licenseService,

    // background trackers
    projectRecommendQuestionBackgroundTracker,
    threadRecommendQuestionBackgroundTracker,
    dashboardCacheBackgroundTracker,
  };
};

// singleton components
export const components = initComponents();
