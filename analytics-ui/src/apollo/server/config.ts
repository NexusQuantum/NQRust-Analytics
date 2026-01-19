import { pickBy } from 'lodash';

export interface IConfig {
  // analytics ui
  otherServiceUsingDocker: boolean;

  // database
  dbType: string;
  // pg
  pgUrl?: string;
  debug?: boolean;
  // sqlite
  sqliteFile?: string;

  persistCredentialDir?: string;

  // analytics engine
  analyticsEngineEndpoint: string;

  // analytics AI
  analyticsAIEndpoint: string;
  generationModel?: string;

  // ibis server
  experimentalEngineRustVersion?: boolean;
  ibisServerEndpoint: string;

  // encryption
  encryptionPassword: string;
  encryptionSalt: string;

  // telemetry
  telemetryEnabled?: boolean;
  posthogApiKey?: string;
  posthogHost?: string;
  userUUID?: string;

  // versions
  analyticsUIVersion?: string;
  analyticsEngineVersion?: string;
  analyticsAIVersion?: string;
  analyticsProductVersion?: string;

  // generate recommendation questions max categories
  projectRecommendationQuestionMaxCategories?: number;
  projectRecommendationQuestionsMaxQuestions?: number;
  threadRecommendationQuestionMaxCategories?: number;
  threadRecommendationQuestionsMaxQuestions?: number;

  // OAuth providers
  googleOAuthEnabled?: boolean;
  githubOAuthEnabled?: boolean;
}

const defaultConfig = {
  // analytics ui
  otherServiceUsingDocker: false,

  // database
  dbType: 'sqlite',

  // pg
  pgUrl: 'postgres://postgres:postgres@localhost:5432/admin_ui',
  debug: false,

  // sqlite
  sqliteFile: './db.sqlite3',

  persistCredentialDir: `${process.cwd()}/.tmp`,

  // analytics engine
  analyticsEngineEndpoint: 'http://localhost:8080',

  // analytics AI
  analyticsAIEndpoint: 'http://localhost:5555',

  // ibis server
  experimentalEngineRustVersion: true,
  ibisServerEndpoint: 'http://127.0.0.1:8000',

  // encryption
  encryptionPassword: 'sementic',
  encryptionSalt: 'layer',
};

const config = {
  // node
  otherServiceUsingDocker: process.env.OTHER_SERVICE_USING_DOCKER === 'true',

  // database
  dbType: process.env.DB_TYPE,
  // pg
  pgUrl: process.env.PG_URL,
  debug: process.env.DEBUG === 'true',
  // sqlite
  sqliteFile: process.env.SQLITE_FILE,

  persistCredentialDir: (() => {
    if (
      process.env.PERSIST_CREDENTIAL_DIR &&
      process.env.PERSIST_CREDENTIAL_DIR.length > 0
    ) {
      return process.env.PERSIST_CREDENTIAL_DIR;
    }
    return undefined;
  })(),

  // analytics engine
  analyticsEngineEndpoint: process.env.ANALYTICS_ENGINE_ENDPOINT,

  // analytics AI
  analyticsAIEndpoint: process.env.ANALYTICS_AI_ENDPOINT,
  generationModel: process.env.GENERATION_MODEL,

  // ibis server
  experimentalEngineRustVersion:
    process.env.EXPERIMENTAL_ENGINE_RUST_VERSION === 'true',
  ibisServerEndpoint: process.env.IBIS_SERVER_ENDPOINT,

  // encryption
  encryptionPassword: process.env.ENCRYPTION_PASSWORD,
  encryptionSalt: process.env.ENCRYPTION_SALT,

  // telemetry
  telemetryEnabled:
    process.env.TELEMETRY_ENABLED &&
    process.env.TELEMETRY_ENABLED.toLocaleLowerCase() === 'true',
  posthogApiKey: process.env.POSTHOG_API_KEY,
  posthogHost: process.env.POSTHOG_HOST,
  userUUID: process.env.USER_UUID,

  // versions
  analyticsUIVersion: process.env.ANALYTICS_UI_VERSION,
  analyticsEngineVersion: process.env.ANALYTICS_ENGINE_VERSION,
  analyticsAIVersion: process.env.ANALYTICS_AI_SERVICE_VERSION,
  analyticsProductVersion: process.env.ANALYTICS_PRODUCT_VERSION,

  // generate recommendation questions max questions
  projectRecommendationQuestionMaxCategories: process.env
    .PROJECT_RECOMMENDATION_QUESTION_MAX_CATEGORIES
    ? parseInt(process.env.PROJECT_RECOMMENDATION_QUESTION_MAX_CATEGORIES)
    : 3,
  projectRecommendationQuestionsMaxQuestions: process.env
    .PROJECT_RECOMMENDATION_QUESTIONS_MAX_QUESTIONS
    ? parseInt(process.env.PROJECT_RECOMMENDATION_QUESTIONS_MAX_QUESTIONS)
    : 3,
  threadRecommendationQuestionMaxCategories: process.env
    .THREAD_RECOMMENDATION_QUESTION_MAX_CATEGORIES
    ? parseInt(process.env.THREAD_RECOMMENDATION_QUESTION_MAX_CATEGORIES)
    : 3,
  threadRecommendationQuestionsMaxQuestions: process.env
    .THREAD_RECOMMENDATION_QUESTIONS_MAX_QUESTIONS
    ? parseInt(process.env.THREAD_RECOMMENDATION_QUESTIONS_MAX_QUESTIONS)
    : 1,

  // OAuth providers - enabled by default if credentials are provided
  // Set to 'false' to explicitly disable even if credentials exist
  googleOAuthEnabled: process.env.GOOGLE_OAUTH_ENABLED !== 'false' &&
    !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  githubOAuthEnabled: process.env.GITHUB_OAUTH_ENABLED !== 'false' &&
    !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
};

export function getConfig(): IConfig {
  return { ...defaultConfig, ...pickBy(config) };
}
