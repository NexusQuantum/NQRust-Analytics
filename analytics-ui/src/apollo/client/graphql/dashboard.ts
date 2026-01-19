import { gql } from '@apollo/client';

export const COMMON_DASHBOARD_ITEM = gql`
  fragment CommonDashboardItem on DashboardItem {
    id
    dashboardId
    type
    layout {
      x
      y
      w
      h
    }
    detail {
      sql
      chartSchema
    }
    displayName
  }
`;

export const DASHBOARD_ITEMS = gql`
  query DashboardItems {
    dashboardItems {
      ...CommonDashboardItem
    }
  }
  ${COMMON_DASHBOARD_ITEM}
`;

export const CREATE_DASHBOARD_ITEM = gql`
  mutation CreateDashboardItem($data: CreateDashboardItemInput!) {
    createDashboardItem(data: $data) {
      ...CommonDashboardItem
    }
  }
  ${COMMON_DASHBOARD_ITEM}
`;

export const UPDATE_DASHBOARD_ITEM = gql`
  mutation UpdateDashboardItem(
    $where: DashboardItemWhereInput!
    $data: UpdateDashboardItemInput!
  ) {
    updateDashboardItem(where: $where, data: $data) {
      ...CommonDashboardItem
    }
  }
  ${COMMON_DASHBOARD_ITEM}
`;

export const UPDATE_DASHBOARD_ITEM_LAYOUTS = gql`
  mutation UpdateDashboardItemLayouts($data: UpdateDashboardItemLayoutsInput!) {
    updateDashboardItemLayouts(data: $data) {
      ...CommonDashboardItem
    }
  }
  ${COMMON_DASHBOARD_ITEM}
`;

export const DELETE_DASHBOARD_ITEM = gql`
  mutation DeleteDashboardItem($where: DashboardItemWhereInput!) {
    deleteDashboardItem(where: $where)
  }
`;

export const PREVIEW_ITEM_SQL = gql`
  mutation PreviewItemSQL($data: PreviewItemSQLInput!) {
    previewItemSQL(data: $data) {
      data
      cacheHit
      cacheCreatedAt
      cacheOverrodeAt
      override
    }
  }
`;

export const SET_DASHBOARD_SCHEDULE = gql`
  mutation SetDashboardSchedule($data: SetDashboardScheduleInput!) {
    setDashboardSchedule(data: $data) {
      id
      projectId
      name
      cacheEnabled
      scheduleFrequency
      scheduleTimezone
      scheduleCron
      nextScheduledAt
    }
  }
`;

export const DASHBOARD = gql`
  query Dashboard {
    dashboard {
      id
      name
      description
      cacheEnabled
      nextScheduledAt
      schedule {
        frequency
        hour
        minute
        day
        timezone
        cron
      }
      items {
        ...CommonDashboardItem
      }
    }
  }
  ${COMMON_DASHBOARD_ITEM}
`;

// ========================================
// Multi-Dashboard Queries & Mutations
// ========================================

export const COMMON_DASHBOARD = gql`
  fragment CommonDashboard on Dashboard {
    id
    name
    description
    isDefault
    isStarred
    createdBy
    creatorEmail
    creatorDisplayName
    cacheEnabled
  }
`;

export const LIST_DASHBOARDS = gql`
  query ListDashboards {
    dashboards {
      ...CommonDashboard
    }
  }
  ${COMMON_DASHBOARD}
`;

export const GET_DASHBOARD_BY_ID = gql`
  query GetDashboardById($id: ID!) {
    dashboard(id: $id) {
      id
      name
      description
      isDefault
      createdBy
      creatorEmail
      creatorDisplayName
      cacheEnabled
      nextScheduledAt
      schedule {
        frequency
        hour
        minute
        day
        timezone
        cron
      }
      items {
        ...CommonDashboardItem
      }
    }
  }
  ${COMMON_DASHBOARD_ITEM}
`;

export const CREATE_DASHBOARD = gql`
  mutation CreateDashboard($data: CreateDashboardInput!) {
    createDashboard(data: $data) {
      ...CommonDashboard
    }
  }
  ${COMMON_DASHBOARD}
`;

export const UPDATE_DASHBOARD = gql`
  mutation UpdateDashboard($id: ID!, $data: UpdateDashboardDataInput!) {
    updateDashboard(id: $id, data: $data) {
      ...CommonDashboard
    }
  }
  ${COMMON_DASHBOARD}
`;

export const DELETE_DASHBOARD = gql`
  mutation DeleteDashboard($id: ID!) {
    deleteDashboard(id: $id)
  }
`;

export const SET_DEFAULT_DASHBOARD = gql`
  mutation SetDefaultDashboard($id: ID!) {
    setDefaultDashboard(id: $id) {
      ...CommonDashboard
    }
  }
  ${COMMON_DASHBOARD}
`;

// ========================================
// Dashboard Sharing Queries & Mutations
// ========================================

export const SHARE_DASHBOARD = gql`
  mutation ShareDashboard($dashboardId: ID!, $email: String!, $permission: SharePermission) {
    shareDashboard(dashboardId: $dashboardId, email: $email, permission: $permission) {
      id
      dashboardId
      userId
      permission
    }
  }
`;

export const UNSHARE_DASHBOARD = gql`
  mutation UnshareDashboard($dashboardId: ID!, $userId: ID!) {
    unshareDashboard(dashboardId: $dashboardId, userId: $userId)
  }
`;

export const GET_SHARED_USERS = gql`
  query GetSharedUsers($dashboardId: ID!) {
    getSharedUsers(dashboardId: $dashboardId) {
      id
      dashboardId
      userId
      permission
      userEmail
      userDisplayName
    }
  }
`;

// ========================================
// Dashboard Starring Mutations
// ========================================

export const STAR_DASHBOARD = gql`
  mutation StarDashboard($dashboardId: ID!) {
    starDashboard(dashboardId: $dashboardId)
  }
`;

export const UNSTAR_DASHBOARD = gql`
  mutation UnstarDashboard($dashboardId: ID!) {
    unstarDashboard(dashboardId: $dashboardId)
  }
`;
