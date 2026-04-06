import microCors from 'micro-cors';
import { NextApiRequest, NextApiResponse, PageConfig } from 'next';
import { ApolloServer } from 'apollo-server-micro';
import { getToken } from 'next-auth/jwt';
import { typeDefs } from '@server';
import resolvers from '@server/resolvers';
import { IContext } from '@server/types';
import { GraphQLError } from 'graphql';
import { getLogger } from '@server/utils';
import { getConfig } from '@server/config';
import { ModelService } from '@server/services/modelService';
import {
  defaultApolloErrorHandler,
  GeneralErrorCodes,
} from '@/apollo/server/utils/error';
import { TelemetryEvent } from '@/apollo/server/telemetry/telemetry';
import { components } from '@/common';

const serverConfig = getConfig();
const logger = getLogger('APOLLO');
logger.level = 'debug';

const cors = microCors();

export const config: PageConfig = {
  api: {
    bodyParser: false,
  },
};

const bootstrapServer = async () => {
  const {
    telemetry,

    // repositories
    projectRepository,
    modelRepository,
    modelColumnRepository,
    relationRepository,
    deployLogRepository,
    viewRepository,
    schemaChangeRepository,
    learningRepository,
    modelNestedColumnRepository,
    dashboardRepository,
    dashboardItemRepository,
    dashboardShareRepository,
    starredDashboardRepository,
    threadRepository,
    threadShareRepository,
    userRepository,
    sqlPairRepository,
    instructionRepository,
    apiHistoryRepository,
    dashboardItemRefreshJobRepository,
    // adaptors
    analyticsEngineAdaptor,
    ibisAdaptor,
    analyticsAIAdaptor,

    // services
    projectService,
    queryService,
    askingService,
    deployService,
    mdlService,
    dashboardService,
    sqlPairService,

    instructionService,
    licenseService,
    // background trackers
    projectRecommendQuestionBackgroundTracker,
    threadRecommendQuestionBackgroundTracker,
    dashboardCacheBackgroundTracker,
    knex,
  } = components;

  const modelService = new ModelService({
    projectService,
    modelRepository,
    modelColumnRepository,
    relationRepository,
    viewRepository,
    mdlService,
    analyticsEngineAdaptor,
    queryService,
  });

  // initialize services
  await Promise.all([
    askingService.initialize(),
    projectRecommendQuestionBackgroundTracker.initialize(),
    threadRecommendQuestionBackgroundTracker.initialize(),
  ]);

  const apolloServer: ApolloServer = new ApolloServer({
    typeDefs,
    resolvers,
    formatError: (error: GraphQLError) => {
      // stop print error stacktrace of dry run error
      if (error.extensions?.code === GeneralErrorCodes.DRY_RUN_ERROR) {
        return defaultApolloErrorHandler(error);
      }

      // print error stacktrace of graphql error
      const stacktrace = error.extensions?.exception?.stacktrace;
      if (stacktrace) {
        logger.error(stacktrace.join('\n'));
      }

      // print original error stacktrace
      const originalError = error.extensions?.originalError as Error;
      if (originalError) {
        logger.error(`== original error ==`);
        // error may not have stack, so print error message if stack is not available
        logger.error(originalError.stack || originalError.message);
      }

      // telemetry: capture internal server error
      if (error.extensions?.code === GeneralErrorCodes.INTERNAL_SERVER_ERROR) {
        telemetry.sendEvent(
          TelemetryEvent.GRAPHQL_ERROR,
          {
            originalErrorStack: originalError?.stack,
            originalErrorMessage: originalError?.message,
            errorMessage: error.message,
          },
          error.extensions?.service,
          false,
        );
      }
      return defaultApolloErrorHandler(error);
    },
    introspection: process.env.NODE_ENV !== 'production',
    cache: 'bounded',
    context: async ({ req, res }): Promise<IContext & { user?: any; ipAddress?: string; knex: typeof knex }> => {
      // Extract authentication from NextAuth JWT cookie
      let user = null;
      let ipAddress: string | undefined;
      try {
        const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
        if (token?.userId) {
          const dbUser = await userRepository.findByIdWithRoles(Number(token.userId));
          if (dbUser && dbUser.isActive) user = dbUser;
        }
        const forwarded = req.headers['x-forwarded-for'];
        ipAddress = typeof forwarded === 'string'
          ? forwarded.split(',')[0].trim()
          : req.socket?.remoteAddress;
      } catch (err) {
        logger.warn('Failed to extract auth context from request:', err);
      }

      return {
        req,
        res,
        config: serverConfig,
        telemetry,
        user,
        ipAddress,
        knex,
        // adaptor
        analyticsEngineAdaptor,
        ibisServerAdaptor: ibisAdaptor,
        analyticsAIAdaptor,
        // services
        projectService,
        modelService,
        mdlService,
        deployService,
        askingService,
        queryService,
        dashboardService,
        sqlPairService,
        instructionService,
        licenseService,
        licenseState: licenseService.getLicenseState(),
        // repository
        projectRepository,
        modelRepository,
        modelColumnRepository,
        modelNestedColumnRepository,
        relationRepository,
        viewRepository,
        deployRepository: deployLogRepository,
        schemaChangeRepository,
        learningRepository,
        dashboardRepository,
        dashboardItemRepository,
        dashboardShareRepository,
        starredDashboardRepository,
        threadRepository,
        threadShareRepository,
        userRepository,
        sqlPairRepository,
        instructionRepository,
        apiHistoryRepository,
        dashboardItemRefreshJobRepository,
        // background trackers
        projectRecommendQuestionBackgroundTracker,
        threadRecommendQuestionBackgroundTracker,
        dashboardCacheBackgroundTracker,
      };
    },
  });
  await apolloServer.start();
  return apolloServer;
};

const startServer = bootstrapServer();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const apolloServer = await startServer;
  await apolloServer.createHandler({
    path: '/api/graphql',
  })(req, res);
};

export default cors((req: NextApiRequest, res: NextApiResponse) =>
  req.method === 'OPTIONS' ? res.status(200).end() : handler(req, res),
);
