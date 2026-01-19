import GraphQLJSON from 'graphql-type-json';
import { ProjectResolver } from './resolvers/projectResolver';
import { ModelResolver } from './resolvers/modelResolver';
import { AskingResolver } from './resolvers/askingResolver';
import { DiagramResolver } from './resolvers/diagramResolver';
import { LearningResolver } from './resolvers/learningResolver';
import { DashboardResolver } from './resolvers/dashboardResolver';
import { SqlPairResolver } from './resolvers/sqlPairResolver';
import { InstructionResolver } from './resolvers/instructionResolver';
import { ApiHistoryResolver } from './resolvers/apiHistoryResolver';
import { AuthResolver } from './resolvers/authResolver';
import { convertColumnType } from '@server/utils';
import { DialectSQLScalar } from './scalars';

const projectResolver = new ProjectResolver();
const modelResolver = new ModelResolver();
const askingResolver = new AskingResolver();
const diagramResolver = new DiagramResolver();
const learningResolver = new LearningResolver();
const dashboardResolver = new DashboardResolver();
const sqlPairResolver = new SqlPairResolver();
const instructionResolver = new InstructionResolver();
const apiHistoryResolver = new ApiHistoryResolver();
const authResolver = new AuthResolver();
const resolvers = {
  JSON: GraphQLJSON,
  DialectSQL: DialectSQLScalar,
  Query: {
    listDataSourceTables: projectResolver.listDataSourceTables,
    autoGenerateRelation: projectResolver.autoGenerateRelation,
    listModels: modelResolver.listModels,
    model: modelResolver.getModel,
    onboardingStatus: projectResolver.getOnboardingStatus,
    modelSync: modelResolver.checkModelSync,
    diagram: diagramResolver.getDiagram,
    schemaChange: projectResolver.getSchemaChange,

    // Ask
    askingTask: askingResolver.getAskingTask,
    suggestedQuestions: askingResolver.getSuggestedQuestions,
    instantRecommendedQuestions: askingResolver.getInstantRecommendedQuestions,

    // Adjustment
    adjustmentTask: askingResolver.getAdjustmentTask,

    // Thread
    thread: askingResolver.getThread,
    threads: askingResolver.listThreads,
    threadResponse: askingResolver.getResponse,
    nativeSql: modelResolver.getNativeSql,
    getThreadSharedUsers: askingResolver.getThreadSharedUsers,

    // Views
    listViews: modelResolver.listViews,
    view: modelResolver.getView,

    // Settings
    settings: projectResolver.getSettings,
    getMDL: modelResolver.getMDL,

    // Learning
    learningRecord: learningResolver.getLearningRecord,

    // Recommendation questions
    getThreadRecommendationQuestions:
      askingResolver.getThreadRecommendationQuestions,
    getProjectRecommendationQuestions:
      projectResolver.getProjectRecommendationQuestions,

    // Dashboard
    dashboardItems: dashboardResolver.getDashboardItems,
    dashboard: dashboardResolver.getDashboard,
    dashboards: dashboardResolver.listDashboards,
    getSharedUsers: dashboardResolver.getSharedUsers,

    // SQL Pairs
    sqlPairs: sqlPairResolver.getProjectSqlPairs,
    // Instructions
    instructions: instructionResolver.getInstructions,

    // API History
    apiHistory: apiHistoryResolver.getApiHistory,

    // User Management
    me: authResolver.me,
    users: authResolver.users,
    user: authResolver.user,
    roles: authResolver.roles,
    role: authResolver.role,
    permissions: authResolver.permissions,
    projectMembers: authResolver.projectMembers,
  },
  Mutation: {
    deploy: modelResolver.deploy,
    saveDataSource: projectResolver.saveDataSource,
    startSampleDataset: projectResolver.startSampleDataset,
    saveTables: projectResolver.saveTables,
    saveRelations: projectResolver.saveRelations,
    createModel: modelResolver.createModel,
    updateModel: modelResolver.updateModel,
    deleteModel: modelResolver.deleteModel,
    previewModelData: modelResolver.previewModelData,
    updateModelMetadata: modelResolver.updateModelMetadata,
    triggerDataSourceDetection: projectResolver.triggerDataSourceDetection,
    resolveSchemaChange: projectResolver.resolveSchemaChange,

    // calculated field
    createCalculatedField: modelResolver.createCalculatedField,
    validateCalculatedField: modelResolver.validateCalculatedField,
    updateCalculatedField: modelResolver.updateCalculatedField,
    deleteCalculatedField: modelResolver.deleteCalculatedField,

    // relation
    createRelation: modelResolver.createRelation,
    updateRelation: modelResolver.updateRelation,
    deleteRelation: modelResolver.deleteRelation,

    // Ask
    createAskingTask: askingResolver.createAskingTask,
    cancelAskingTask: askingResolver.cancelAskingTask,
    createInstantRecommendedQuestions:
      askingResolver.createInstantRecommendedQuestions,
    rerunAskingTask: askingResolver.rerunAskingTask,

    // Adjustment
    adjustThreadResponse: askingResolver.adjustThreadResponse,
    cancelAdjustmentTask: askingResolver.cancelAdjustThreadResponseAnswer,
    rerunAdjustmentTask: askingResolver.rerunAdjustThreadResponseAnswer,

    // Thread
    createThread: askingResolver.createThread,
    updateThread: askingResolver.updateThread,
    deleteThread: askingResolver.deleteThread,
    // Thread Sharing
    shareThread: askingResolver.shareThread,
    unshareThread: askingResolver.unshareThread,
    createThreadResponse: askingResolver.createThreadResponse,
    updateThreadResponse: askingResolver.updateThreadResponse,
    previewData: askingResolver.previewData,
    previewBreakdownData: askingResolver.previewBreakdownData,

    // Generate Thread Response Breakdown
    generateThreadResponseBreakdown:
      askingResolver.generateThreadResponseBreakdown,

    // Generate Thread Response Answer
    generateThreadResponseAnswer: askingResolver.generateThreadResponseAnswer,

    // Generate Thread Response Chart
    generateThreadResponseChart: askingResolver.generateThreadResponseChart,

    // Adjust Thread Response Chart
    adjustThreadResponseChart: askingResolver.adjustThreadResponseChart,

    // Views
    createView: modelResolver.createView,
    deleteView: modelResolver.deleteView,
    previewViewData: modelResolver.previewViewData,
    validateView: modelResolver.validateView,
    updateViewMetadata: modelResolver.updateViewMetadata,

    // Settings
    resetCurrentProject: projectResolver.resetCurrentProject,
    updateCurrentProject: projectResolver.updateCurrentProject,
    updateDataSource: projectResolver.updateDataSource,

    // preview
    previewSql: modelResolver.previewSql,

    // Learning
    saveLearningRecord: learningResolver.saveLearningRecord,

    // Recommendation questions
    generateThreadRecommendationQuestions:
      askingResolver.generateThreadRecommendationQuestions,
    generateProjectRecommendationQuestions:
      askingResolver.generateProjectRecommendationQuestions,

    // Dashboard
    updateDashboardItemLayouts: dashboardResolver.updateDashboardItemLayouts,
    createDashboardItem: dashboardResolver.createDashboardItem,
    updateDashboardItem: dashboardResolver.updateDashboardItem,
    deleteDashboardItem: dashboardResolver.deleteDashboardItem,
    previewItemSQL: dashboardResolver.previewItemSQL,
    setDashboardSchedule: dashboardResolver.setDashboardSchedule,
    // Multi-Dashboard Management
    createDashboard: dashboardResolver.createDashboard,
    updateDashboard: dashboardResolver.updateDashboard,
    deleteDashboard: dashboardResolver.deleteDashboard,
    setDefaultDashboard: dashboardResolver.setDefaultDashboard,
    // Dashboard Sharing
    shareDashboard: dashboardResolver.shareDashboard,
    unshareDashboard: dashboardResolver.unshareDashboard,
    // Dashboard Starring
    starDashboard: dashboardResolver.starDashboard,
    unstarDashboard: dashboardResolver.unstarDashboard,

    // SQL Pairs
    createSqlPair: sqlPairResolver.createSqlPair,
    updateSqlPair: sqlPairResolver.updateSqlPair,
    deleteSqlPair: sqlPairResolver.deleteSqlPair,
    generateQuestion: sqlPairResolver.generateQuestion,
    modelSubstitute: sqlPairResolver.modelSubstitute,
    // Instructions
    createInstruction: instructionResolver.createInstruction,
    updateInstruction: instructionResolver.updateInstruction,
    deleteInstruction: instructionResolver.deleteInstruction,

    // Auth
    register: authResolver.register,
    login: authResolver.login,
    logout: authResolver.logout,
    changePassword: authResolver.changePassword,
    requestPasswordReset: authResolver.requestPasswordReset,
    refreshToken: authResolver.refreshToken,
    revokeAllSessions: authResolver.revokeAllSessions,

    // User Management
    createUser: authResolver.createUser,
    updateUser: authResolver.updateUser,
    deleteUser: authResolver.deleteUser,

    // Role Management
    createRole: authResolver.createRole,
    updateRole: authResolver.updateRole,
    deleteRole: authResolver.deleteRole,

    // Project Members
    inviteProjectMember: authResolver.inviteProjectMember,
    updateProjectMember: authResolver.updateProjectMember,
    removeProjectMember: authResolver.removeProjectMember,
  },
  ThreadResponse: askingResolver.getThreadResponseNestedResolver(),
  DetailStep: askingResolver.getDetailStepNestedResolver(),
  ResultCandidate: askingResolver.getResultCandidateNestedResolver(),

  // Handle struct type to record for UI
  DiagramModelField: { type: convertColumnType },
  DiagramModelNestedField: { type: convertColumnType },
  CompactColumn: { type: convertColumnType },
  FieldInfo: { type: convertColumnType },
  DetailedColumn: { type: convertColumnType },
  DetailedNestedColumn: { type: convertColumnType },
  DetailedChangeColumn: { type: convertColumnType },

  // Add this line to include the SqlPair nested resolver
  SqlPair: sqlPairResolver.getSqlPairNestedResolver(),

  // Add ApiHistoryResponse nested resolvers
  ApiHistoryResponse: apiHistoryResolver.getApiHistoryNestedResolver(),

  // Add User Management nested resolvers
  User: authResolver.getUserNestedResolver(),
  Role: authResolver.getRoleNestedResolver(),
  ProjectMember: authResolver.getProjectMemberNestedResolver(),
};

export default resolvers;
