import * as Types from './__types__';

import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
const defaultOptions = {} as const;
export type CommonDashboardItemFragment = { __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } };

export type DashboardItemsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type DashboardItemsQuery = { __typename?: 'Query', dashboardItems: Array<{ __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } }> };

export type CreateDashboardItemMutationVariables = Types.Exact<{
  data: Types.CreateDashboardItemInput;
}>;


export type CreateDashboardItemMutation = { __typename?: 'Mutation', createDashboardItem: { __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } } };

export type UpdateDashboardItemMutationVariables = Types.Exact<{
  where: Types.DashboardItemWhereInput;
  data: Types.UpdateDashboardItemInput;
}>;


export type UpdateDashboardItemMutation = { __typename?: 'Mutation', updateDashboardItem: { __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } } };

export type UpdateDashboardItemLayoutsMutationVariables = Types.Exact<{
  data: Types.UpdateDashboardItemLayoutsInput;
}>;


export type UpdateDashboardItemLayoutsMutation = { __typename?: 'Mutation', updateDashboardItemLayouts: Array<{ __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } }> };

export type DeleteDashboardItemMutationVariables = Types.Exact<{
  where: Types.DashboardItemWhereInput;
}>;


export type DeleteDashboardItemMutation = { __typename?: 'Mutation', deleteDashboardItem: boolean };

export type PreviewItemSqlMutationVariables = Types.Exact<{
  data: Types.PreviewItemSqlInput;
}>;


export type PreviewItemSqlMutation = { __typename?: 'Mutation', previewItemSQL: { __typename?: 'PreviewItemResponse', data: any, cacheHit: boolean, cacheCreatedAt?: string | null, cacheOverrodeAt?: string | null, override: boolean } };

export type SetDashboardScheduleMutationVariables = Types.Exact<{
  data: Types.SetDashboardScheduleInput;
}>;


export type SetDashboardScheduleMutation = { __typename?: 'Mutation', setDashboardSchedule: { __typename?: 'Dashboard', id: number, projectId: number, name: string, cacheEnabled: boolean, scheduleFrequency?: Types.ScheduleFrequencyEnum | null, scheduleTimezone?: string | null, scheduleCron?: string | null, nextScheduledAt?: string | null } };

export type DashboardQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type DashboardQuery = { __typename?: 'Query', dashboard: { __typename?: 'DetailedDashboard', id: number, name: string, description?: string | null, cacheEnabled: boolean, nextScheduledAt?: string | null, schedule?: { __typename?: 'DashboardSchedule', frequency?: Types.ScheduleFrequencyEnum | null, hour?: number | null, minute?: number | null, day?: Types.CacheScheduleDayEnum | null, timezone?: string | null, cron?: string | null } | null, items: Array<{ __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } }> } };

export type CommonDashboardFragment = { __typename?: 'Dashboard', id: number, name: string, description?: string | null, isDefault: boolean, isStarred: boolean, createdBy?: number | null, creatorEmail?: string | null, creatorDisplayName?: string | null, cacheEnabled: boolean };

export type ListDashboardsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ListDashboardsQuery = { __typename?: 'Query', dashboards: Array<{ __typename?: 'Dashboard', id: number, name: string, description?: string | null, isDefault: boolean, isStarred: boolean, createdBy?: number | null, creatorEmail?: string | null, creatorDisplayName?: string | null, cacheEnabled: boolean }> };

export type GetDashboardByIdQueryVariables = Types.Exact<{
  id: Types.Scalars['ID'];
}>;


export type GetDashboardByIdQuery = { __typename?: 'Query', dashboard: { __typename?: 'DetailedDashboard', id: number, name: string, description?: string | null, isDefault: boolean, createdBy?: number | null, creatorEmail?: string | null, creatorDisplayName?: string | null, cacheEnabled: boolean, nextScheduledAt?: string | null, schedule?: { __typename?: 'DashboardSchedule', frequency?: Types.ScheduleFrequencyEnum | null, hour?: number | null, minute?: number | null, day?: Types.CacheScheduleDayEnum | null, timezone?: string | null, cron?: string | null } | null, items: Array<{ __typename?: 'DashboardItem', id: number, dashboardId: number, type: Types.DashboardItemType, displayName?: string | null, layout: { __typename?: 'DashboardItemLayout', x: number, y: number, w: number, h: number }, detail: { __typename?: 'DashboardItemDetail', sql: string, chartSchema?: any | null } }> } };

export type CreateDashboardMutationVariables = Types.Exact<{
  data: Types.CreateDashboardInput;
}>;


export type CreateDashboardMutation = { __typename?: 'Mutation', createDashboard: { __typename?: 'Dashboard', id: number, name: string, description?: string | null, isDefault: boolean, isStarred: boolean, createdBy?: number | null, creatorEmail?: string | null, creatorDisplayName?: string | null, cacheEnabled: boolean } };

export type UpdateDashboardMutationVariables = Types.Exact<{
  id: Types.Scalars['ID'];
  data: Types.UpdateDashboardInput;
}>;


export type UpdateDashboardMutation = { __typename?: 'Mutation', updateDashboard: { __typename?: 'Dashboard', id: number, name: string, description?: string | null, isDefault: boolean, isStarred: boolean, createdBy?: number | null, creatorEmail?: string | null, creatorDisplayName?: string | null, cacheEnabled: boolean } };

export type DeleteDashboardMutationVariables = Types.Exact<{
  id: Types.Scalars['ID'];
}>;


export type DeleteDashboardMutation = { __typename?: 'Mutation', deleteDashboard: boolean };

export type SetDefaultDashboardMutationVariables = Types.Exact<{
  id: Types.Scalars['ID'];
}>;


export type SetDefaultDashboardMutation = { __typename?: 'Mutation', setDefaultDashboard: { __typename?: 'Dashboard', id: number, name: string, description?: string | null, isDefault: boolean, isStarred: boolean, createdBy?: number | null, creatorEmail?: string | null, creatorDisplayName?: string | null, cacheEnabled: boolean } };

export type ShareDashboardMutationVariables = Types.Exact<{
  dashboardId: Types.Scalars['ID'];
  email: Types.Scalars['String'];
  permission?: Types.InputMaybe<Types.SharePermission>;
}>;


export type ShareDashboardMutation = { __typename?: 'Mutation', shareDashboard: { __typename?: 'DashboardShare', id: number, dashboardId: number, userId: number, permission: Types.SharePermission } };

export type UnshareDashboardMutationVariables = Types.Exact<{
  dashboardId: Types.Scalars['ID'];
  userId: Types.Scalars['ID'];
}>;


export type UnshareDashboardMutation = { __typename?: 'Mutation', unshareDashboard: boolean };

export type GetSharedUsersQueryVariables = Types.Exact<{
  dashboardId: Types.Scalars['ID'];
}>;


export type GetSharedUsersQuery = { __typename?: 'Query', getSharedUsers: Array<{ __typename?: 'DashboardShareWithUser', id: number, dashboardId: number, userId: number, permission: Types.SharePermission, userEmail: string, userDisplayName?: string | null }> };

export type StarDashboardMutationVariables = Types.Exact<{
  dashboardId: Types.Scalars['ID'];
}>;


export type StarDashboardMutation = { __typename?: 'Mutation', starDashboard: boolean };

export type UnstarDashboardMutationVariables = Types.Exact<{
  dashboardId: Types.Scalars['ID'];
}>;


export type UnstarDashboardMutation = { __typename?: 'Mutation', unstarDashboard: boolean };

export const CommonDashboardItemFragmentDoc = gql`
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
export const CommonDashboardFragmentDoc = gql`
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
export const DashboardItemsDocument = gql`
    query DashboardItems {
  dashboardItems {
    ...CommonDashboardItem
  }
}
    ${CommonDashboardItemFragmentDoc}`;

/**
 * __useDashboardItemsQuery__
 *
 * To run a query within a React component, call `useDashboardItemsQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardItemsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardItemsQuery({
 *   variables: {
 *   },
 * });
 */
export function useDashboardItemsQuery(baseOptions?: Apollo.QueryHookOptions<DashboardItemsQuery, DashboardItemsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardItemsQuery, DashboardItemsQueryVariables>(DashboardItemsDocument, options);
      }
export function useDashboardItemsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardItemsQuery, DashboardItemsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardItemsQuery, DashboardItemsQueryVariables>(DashboardItemsDocument, options);
        }
export type DashboardItemsQueryHookResult = ReturnType<typeof useDashboardItemsQuery>;
export type DashboardItemsLazyQueryHookResult = ReturnType<typeof useDashboardItemsLazyQuery>;
export type DashboardItemsQueryResult = Apollo.QueryResult<DashboardItemsQuery, DashboardItemsQueryVariables>;
export const CreateDashboardItemDocument = gql`
    mutation CreateDashboardItem($data: CreateDashboardItemInput!) {
  createDashboardItem(data: $data) {
    ...CommonDashboardItem
  }
}
    ${CommonDashboardItemFragmentDoc}`;
export type CreateDashboardItemMutationFn = Apollo.MutationFunction<CreateDashboardItemMutation, CreateDashboardItemMutationVariables>;

/**
 * __useCreateDashboardItemMutation__
 *
 * To run a mutation, you first call `useCreateDashboardItemMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateDashboardItemMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createDashboardItemMutation, { data, loading, error }] = useCreateDashboardItemMutation({
 *   variables: {
 *      data: // value for 'data'
 *   },
 * });
 */
export function useCreateDashboardItemMutation(baseOptions?: Apollo.MutationHookOptions<CreateDashboardItemMutation, CreateDashboardItemMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateDashboardItemMutation, CreateDashboardItemMutationVariables>(CreateDashboardItemDocument, options);
      }
export type CreateDashboardItemMutationHookResult = ReturnType<typeof useCreateDashboardItemMutation>;
export type CreateDashboardItemMutationResult = Apollo.MutationResult<CreateDashboardItemMutation>;
export type CreateDashboardItemMutationOptions = Apollo.BaseMutationOptions<CreateDashboardItemMutation, CreateDashboardItemMutationVariables>;
export const UpdateDashboardItemDocument = gql`
    mutation UpdateDashboardItem($where: DashboardItemWhereInput!, $data: UpdateDashboardItemInput!) {
  updateDashboardItem(where: $where, data: $data) {
    ...CommonDashboardItem
  }
}
    ${CommonDashboardItemFragmentDoc}`;
export type UpdateDashboardItemMutationFn = Apollo.MutationFunction<UpdateDashboardItemMutation, UpdateDashboardItemMutationVariables>;

/**
 * __useUpdateDashboardItemMutation__
 *
 * To run a mutation, you first call `useUpdateDashboardItemMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDashboardItemMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDashboardItemMutation, { data, loading, error }] = useUpdateDashboardItemMutation({
 *   variables: {
 *      where: // value for 'where'
 *      data: // value for 'data'
 *   },
 * });
 */
export function useUpdateDashboardItemMutation(baseOptions?: Apollo.MutationHookOptions<UpdateDashboardItemMutation, UpdateDashboardItemMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateDashboardItemMutation, UpdateDashboardItemMutationVariables>(UpdateDashboardItemDocument, options);
      }
export type UpdateDashboardItemMutationHookResult = ReturnType<typeof useUpdateDashboardItemMutation>;
export type UpdateDashboardItemMutationResult = Apollo.MutationResult<UpdateDashboardItemMutation>;
export type UpdateDashboardItemMutationOptions = Apollo.BaseMutationOptions<UpdateDashboardItemMutation, UpdateDashboardItemMutationVariables>;
export const UpdateDashboardItemLayoutsDocument = gql`
    mutation UpdateDashboardItemLayouts($data: UpdateDashboardItemLayoutsInput!) {
  updateDashboardItemLayouts(data: $data) {
    ...CommonDashboardItem
  }
}
    ${CommonDashboardItemFragmentDoc}`;
export type UpdateDashboardItemLayoutsMutationFn = Apollo.MutationFunction<UpdateDashboardItemLayoutsMutation, UpdateDashboardItemLayoutsMutationVariables>;

/**
 * __useUpdateDashboardItemLayoutsMutation__
 *
 * To run a mutation, you first call `useUpdateDashboardItemLayoutsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDashboardItemLayoutsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDashboardItemLayoutsMutation, { data, loading, error }] = useUpdateDashboardItemLayoutsMutation({
 *   variables: {
 *      data: // value for 'data'
 *   },
 * });
 */
export function useUpdateDashboardItemLayoutsMutation(baseOptions?: Apollo.MutationHookOptions<UpdateDashboardItemLayoutsMutation, UpdateDashboardItemLayoutsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateDashboardItemLayoutsMutation, UpdateDashboardItemLayoutsMutationVariables>(UpdateDashboardItemLayoutsDocument, options);
      }
export type UpdateDashboardItemLayoutsMutationHookResult = ReturnType<typeof useUpdateDashboardItemLayoutsMutation>;
export type UpdateDashboardItemLayoutsMutationResult = Apollo.MutationResult<UpdateDashboardItemLayoutsMutation>;
export type UpdateDashboardItemLayoutsMutationOptions = Apollo.BaseMutationOptions<UpdateDashboardItemLayoutsMutation, UpdateDashboardItemLayoutsMutationVariables>;
export const DeleteDashboardItemDocument = gql`
    mutation DeleteDashboardItem($where: DashboardItemWhereInput!) {
  deleteDashboardItem(where: $where)
}
    `;
export type DeleteDashboardItemMutationFn = Apollo.MutationFunction<DeleteDashboardItemMutation, DeleteDashboardItemMutationVariables>;

/**
 * __useDeleteDashboardItemMutation__
 *
 * To run a mutation, you first call `useDeleteDashboardItemMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteDashboardItemMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteDashboardItemMutation, { data, loading, error }] = useDeleteDashboardItemMutation({
 *   variables: {
 *      where: // value for 'where'
 *   },
 * });
 */
export function useDeleteDashboardItemMutation(baseOptions?: Apollo.MutationHookOptions<DeleteDashboardItemMutation, DeleteDashboardItemMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteDashboardItemMutation, DeleteDashboardItemMutationVariables>(DeleteDashboardItemDocument, options);
      }
export type DeleteDashboardItemMutationHookResult = ReturnType<typeof useDeleteDashboardItemMutation>;
export type DeleteDashboardItemMutationResult = Apollo.MutationResult<DeleteDashboardItemMutation>;
export type DeleteDashboardItemMutationOptions = Apollo.BaseMutationOptions<DeleteDashboardItemMutation, DeleteDashboardItemMutationVariables>;
export const PreviewItemSqlDocument = gql`
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
export type PreviewItemSqlMutationFn = Apollo.MutationFunction<PreviewItemSqlMutation, PreviewItemSqlMutationVariables>;

/**
 * __usePreviewItemSqlMutation__
 *
 * To run a mutation, you first call `usePreviewItemSqlMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `usePreviewItemSqlMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [previewItemSqlMutation, { data, loading, error }] = usePreviewItemSqlMutation({
 *   variables: {
 *      data: // value for 'data'
 *   },
 * });
 */
export function usePreviewItemSqlMutation(baseOptions?: Apollo.MutationHookOptions<PreviewItemSqlMutation, PreviewItemSqlMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<PreviewItemSqlMutation, PreviewItemSqlMutationVariables>(PreviewItemSqlDocument, options);
      }
export type PreviewItemSqlMutationHookResult = ReturnType<typeof usePreviewItemSqlMutation>;
export type PreviewItemSqlMutationResult = Apollo.MutationResult<PreviewItemSqlMutation>;
export type PreviewItemSqlMutationOptions = Apollo.BaseMutationOptions<PreviewItemSqlMutation, PreviewItemSqlMutationVariables>;
export const SetDashboardScheduleDocument = gql`
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
export type SetDashboardScheduleMutationFn = Apollo.MutationFunction<SetDashboardScheduleMutation, SetDashboardScheduleMutationVariables>;

/**
 * __useSetDashboardScheduleMutation__
 *
 * To run a mutation, you first call `useSetDashboardScheduleMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetDashboardScheduleMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setDashboardScheduleMutation, { data, loading, error }] = useSetDashboardScheduleMutation({
 *   variables: {
 *      data: // value for 'data'
 *   },
 * });
 */
export function useSetDashboardScheduleMutation(baseOptions?: Apollo.MutationHookOptions<SetDashboardScheduleMutation, SetDashboardScheduleMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetDashboardScheduleMutation, SetDashboardScheduleMutationVariables>(SetDashboardScheduleDocument, options);
      }
export type SetDashboardScheduleMutationHookResult = ReturnType<typeof useSetDashboardScheduleMutation>;
export type SetDashboardScheduleMutationResult = Apollo.MutationResult<SetDashboardScheduleMutation>;
export type SetDashboardScheduleMutationOptions = Apollo.BaseMutationOptions<SetDashboardScheduleMutation, SetDashboardScheduleMutationVariables>;
export const DashboardDocument = gql`
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
    ${CommonDashboardItemFragmentDoc}`;

/**
 * __useDashboardQuery__
 *
 * To run a query within a React component, call `useDashboardQuery` and pass it any options that fit your needs.
 * When your component renders, `useDashboardQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useDashboardQuery({
 *   variables: {
 *   },
 * });
 */
export function useDashboardQuery(baseOptions?: Apollo.QueryHookOptions<DashboardQuery, DashboardQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<DashboardQuery, DashboardQueryVariables>(DashboardDocument, options);
      }
export function useDashboardLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<DashboardQuery, DashboardQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<DashboardQuery, DashboardQueryVariables>(DashboardDocument, options);
        }
export type DashboardQueryHookResult = ReturnType<typeof useDashboardQuery>;
export type DashboardLazyQueryHookResult = ReturnType<typeof useDashboardLazyQuery>;
export type DashboardQueryResult = Apollo.QueryResult<DashboardQuery, DashboardQueryVariables>;
export const ListDashboardsDocument = gql`
    query ListDashboards {
  dashboards {
    ...CommonDashboard
  }
}
    ${CommonDashboardFragmentDoc}`;

/**
 * __useListDashboardsQuery__
 *
 * To run a query within a React component, call `useListDashboardsQuery` and pass it any options that fit your needs.
 * When your component renders, `useListDashboardsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useListDashboardsQuery({
 *   variables: {
 *   },
 * });
 */
export function useListDashboardsQuery(baseOptions?: Apollo.QueryHookOptions<ListDashboardsQuery, ListDashboardsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ListDashboardsQuery, ListDashboardsQueryVariables>(ListDashboardsDocument, options);
      }
export function useListDashboardsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ListDashboardsQuery, ListDashboardsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ListDashboardsQuery, ListDashboardsQueryVariables>(ListDashboardsDocument, options);
        }
export type ListDashboardsQueryHookResult = ReturnType<typeof useListDashboardsQuery>;
export type ListDashboardsLazyQueryHookResult = ReturnType<typeof useListDashboardsLazyQuery>;
export type ListDashboardsQueryResult = Apollo.QueryResult<ListDashboardsQuery, ListDashboardsQueryVariables>;
export const GetDashboardByIdDocument = gql`
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
    ${CommonDashboardItemFragmentDoc}`;

/**
 * __useGetDashboardByIdQuery__
 *
 * To run a query within a React component, call `useGetDashboardByIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetDashboardByIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetDashboardByIdQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetDashboardByIdQuery(baseOptions: Apollo.QueryHookOptions<GetDashboardByIdQuery, GetDashboardByIdQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetDashboardByIdQuery, GetDashboardByIdQueryVariables>(GetDashboardByIdDocument, options);
      }
export function useGetDashboardByIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetDashboardByIdQuery, GetDashboardByIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetDashboardByIdQuery, GetDashboardByIdQueryVariables>(GetDashboardByIdDocument, options);
        }
export type GetDashboardByIdQueryHookResult = ReturnType<typeof useGetDashboardByIdQuery>;
export type GetDashboardByIdLazyQueryHookResult = ReturnType<typeof useGetDashboardByIdLazyQuery>;
export type GetDashboardByIdQueryResult = Apollo.QueryResult<GetDashboardByIdQuery, GetDashboardByIdQueryVariables>;
export const CreateDashboardDocument = gql`
    mutation CreateDashboard($data: CreateDashboardInput!) {
  createDashboard(data: $data) {
    ...CommonDashboard
  }
}
    ${CommonDashboardFragmentDoc}`;
export type CreateDashboardMutationFn = Apollo.MutationFunction<CreateDashboardMutation, CreateDashboardMutationVariables>;

/**
 * __useCreateDashboardMutation__
 *
 * To run a mutation, you first call `useCreateDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createDashboardMutation, { data, loading, error }] = useCreateDashboardMutation({
 *   variables: {
 *      data: // value for 'data'
 *   },
 * });
 */
export function useCreateDashboardMutation(baseOptions?: Apollo.MutationHookOptions<CreateDashboardMutation, CreateDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateDashboardMutation, CreateDashboardMutationVariables>(CreateDashboardDocument, options);
      }
export type CreateDashboardMutationHookResult = ReturnType<typeof useCreateDashboardMutation>;
export type CreateDashboardMutationResult = Apollo.MutationResult<CreateDashboardMutation>;
export type CreateDashboardMutationOptions = Apollo.BaseMutationOptions<CreateDashboardMutation, CreateDashboardMutationVariables>;
export const UpdateDashboardDocument = gql`
    mutation UpdateDashboard($id: ID!, $data: UpdateDashboardInput!) {
  updateDashboard(id: $id, data: $data) {
    ...CommonDashboard
  }
}
    ${CommonDashboardFragmentDoc}`;
export type UpdateDashboardMutationFn = Apollo.MutationFunction<UpdateDashboardMutation, UpdateDashboardMutationVariables>;

/**
 * __useUpdateDashboardMutation__
 *
 * To run a mutation, you first call `useUpdateDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateDashboardMutation, { data, loading, error }] = useUpdateDashboardMutation({
 *   variables: {
 *      id: // value for 'id'
 *      data: // value for 'data'
 *   },
 * });
 */
export function useUpdateDashboardMutation(baseOptions?: Apollo.MutationHookOptions<UpdateDashboardMutation, UpdateDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateDashboardMutation, UpdateDashboardMutationVariables>(UpdateDashboardDocument, options);
      }
export type UpdateDashboardMutationHookResult = ReturnType<typeof useUpdateDashboardMutation>;
export type UpdateDashboardMutationResult = Apollo.MutationResult<UpdateDashboardMutation>;
export type UpdateDashboardMutationOptions = Apollo.BaseMutationOptions<UpdateDashboardMutation, UpdateDashboardMutationVariables>;
export const DeleteDashboardDocument = gql`
    mutation DeleteDashboard($id: ID!) {
  deleteDashboard(id: $id)
}
    `;
export type DeleteDashboardMutationFn = Apollo.MutationFunction<DeleteDashboardMutation, DeleteDashboardMutationVariables>;

/**
 * __useDeleteDashboardMutation__
 *
 * To run a mutation, you first call `useDeleteDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteDashboardMutation, { data, loading, error }] = useDeleteDashboardMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteDashboardMutation(baseOptions?: Apollo.MutationHookOptions<DeleteDashboardMutation, DeleteDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteDashboardMutation, DeleteDashboardMutationVariables>(DeleteDashboardDocument, options);
      }
export type DeleteDashboardMutationHookResult = ReturnType<typeof useDeleteDashboardMutation>;
export type DeleteDashboardMutationResult = Apollo.MutationResult<DeleteDashboardMutation>;
export type DeleteDashboardMutationOptions = Apollo.BaseMutationOptions<DeleteDashboardMutation, DeleteDashboardMutationVariables>;
export const SetDefaultDashboardDocument = gql`
    mutation SetDefaultDashboard($id: ID!) {
  setDefaultDashboard(id: $id) {
    ...CommonDashboard
  }
}
    ${CommonDashboardFragmentDoc}`;
export type SetDefaultDashboardMutationFn = Apollo.MutationFunction<SetDefaultDashboardMutation, SetDefaultDashboardMutationVariables>;

/**
 * __useSetDefaultDashboardMutation__
 *
 * To run a mutation, you first call `useSetDefaultDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetDefaultDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setDefaultDashboardMutation, { data, loading, error }] = useSetDefaultDashboardMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useSetDefaultDashboardMutation(baseOptions?: Apollo.MutationHookOptions<SetDefaultDashboardMutation, SetDefaultDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetDefaultDashboardMutation, SetDefaultDashboardMutationVariables>(SetDefaultDashboardDocument, options);
      }
export type SetDefaultDashboardMutationHookResult = ReturnType<typeof useSetDefaultDashboardMutation>;
export type SetDefaultDashboardMutationResult = Apollo.MutationResult<SetDefaultDashboardMutation>;
export type SetDefaultDashboardMutationOptions = Apollo.BaseMutationOptions<SetDefaultDashboardMutation, SetDefaultDashboardMutationVariables>;
export const ShareDashboardDocument = gql`
    mutation ShareDashboard($dashboardId: ID!, $email: String!, $permission: SharePermission) {
  shareDashboard(
    dashboardId: $dashboardId
    email: $email
    permission: $permission
  ) {
    id
    dashboardId
    userId
    permission
  }
}
    `;
export type ShareDashboardMutationFn = Apollo.MutationFunction<ShareDashboardMutation, ShareDashboardMutationVariables>;

/**
 * __useShareDashboardMutation__
 *
 * To run a mutation, you first call `useShareDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useShareDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [shareDashboardMutation, { data, loading, error }] = useShareDashboardMutation({
 *   variables: {
 *      dashboardId: // value for 'dashboardId'
 *      email: // value for 'email'
 *      permission: // value for 'permission'
 *   },
 * });
 */
export function useShareDashboardMutation(baseOptions?: Apollo.MutationHookOptions<ShareDashboardMutation, ShareDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ShareDashboardMutation, ShareDashboardMutationVariables>(ShareDashboardDocument, options);
      }
export type ShareDashboardMutationHookResult = ReturnType<typeof useShareDashboardMutation>;
export type ShareDashboardMutationResult = Apollo.MutationResult<ShareDashboardMutation>;
export type ShareDashboardMutationOptions = Apollo.BaseMutationOptions<ShareDashboardMutation, ShareDashboardMutationVariables>;
export const UnshareDashboardDocument = gql`
    mutation UnshareDashboard($dashboardId: ID!, $userId: ID!) {
  unshareDashboard(dashboardId: $dashboardId, userId: $userId)
}
    `;
export type UnshareDashboardMutationFn = Apollo.MutationFunction<UnshareDashboardMutation, UnshareDashboardMutationVariables>;

/**
 * __useUnshareDashboardMutation__
 *
 * To run a mutation, you first call `useUnshareDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnshareDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unshareDashboardMutation, { data, loading, error }] = useUnshareDashboardMutation({
 *   variables: {
 *      dashboardId: // value for 'dashboardId'
 *      userId: // value for 'userId'
 *   },
 * });
 */
export function useUnshareDashboardMutation(baseOptions?: Apollo.MutationHookOptions<UnshareDashboardMutation, UnshareDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnshareDashboardMutation, UnshareDashboardMutationVariables>(UnshareDashboardDocument, options);
      }
export type UnshareDashboardMutationHookResult = ReturnType<typeof useUnshareDashboardMutation>;
export type UnshareDashboardMutationResult = Apollo.MutationResult<UnshareDashboardMutation>;
export type UnshareDashboardMutationOptions = Apollo.BaseMutationOptions<UnshareDashboardMutation, UnshareDashboardMutationVariables>;
export const GetSharedUsersDocument = gql`
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

/**
 * __useGetSharedUsersQuery__
 *
 * To run a query within a React component, call `useGetSharedUsersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSharedUsersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSharedUsersQuery({
 *   variables: {
 *      dashboardId: // value for 'dashboardId'
 *   },
 * });
 */
export function useGetSharedUsersQuery(baseOptions: Apollo.QueryHookOptions<GetSharedUsersQuery, GetSharedUsersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSharedUsersQuery, GetSharedUsersQueryVariables>(GetSharedUsersDocument, options);
      }
export function useGetSharedUsersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSharedUsersQuery, GetSharedUsersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSharedUsersQuery, GetSharedUsersQueryVariables>(GetSharedUsersDocument, options);
        }
export type GetSharedUsersQueryHookResult = ReturnType<typeof useGetSharedUsersQuery>;
export type GetSharedUsersLazyQueryHookResult = ReturnType<typeof useGetSharedUsersLazyQuery>;
export type GetSharedUsersQueryResult = Apollo.QueryResult<GetSharedUsersQuery, GetSharedUsersQueryVariables>;
export const StarDashboardDocument = gql`
    mutation StarDashboard($dashboardId: ID!) {
  starDashboard(dashboardId: $dashboardId)
}
    `;
export type StarDashboardMutationFn = Apollo.MutationFunction<StarDashboardMutation, StarDashboardMutationVariables>;

/**
 * __useStarDashboardMutation__
 *
 * To run a mutation, you first call `useStarDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useStarDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [starDashboardMutation, { data, loading, error }] = useStarDashboardMutation({
 *   variables: {
 *      dashboardId: // value for 'dashboardId'
 *   },
 * });
 */
export function useStarDashboardMutation(baseOptions?: Apollo.MutationHookOptions<StarDashboardMutation, StarDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<StarDashboardMutation, StarDashboardMutationVariables>(StarDashboardDocument, options);
      }
export type StarDashboardMutationHookResult = ReturnType<typeof useStarDashboardMutation>;
export type StarDashboardMutationResult = Apollo.MutationResult<StarDashboardMutation>;
export type StarDashboardMutationOptions = Apollo.BaseMutationOptions<StarDashboardMutation, StarDashboardMutationVariables>;
export const UnstarDashboardDocument = gql`
    mutation UnstarDashboard($dashboardId: ID!) {
  unstarDashboard(dashboardId: $dashboardId)
}
    `;
export type UnstarDashboardMutationFn = Apollo.MutationFunction<UnstarDashboardMutation, UnstarDashboardMutationVariables>;

/**
 * __useUnstarDashboardMutation__
 *
 * To run a mutation, you first call `useUnstarDashboardMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnstarDashboardMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unstarDashboardMutation, { data, loading, error }] = useUnstarDashboardMutation({
 *   variables: {
 *      dashboardId: // value for 'dashboardId'
 *   },
 * });
 */
export function useUnstarDashboardMutation(baseOptions?: Apollo.MutationHookOptions<UnstarDashboardMutation, UnstarDashboardMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnstarDashboardMutation, UnstarDashboardMutationVariables>(UnstarDashboardDocument, options);
      }
export type UnstarDashboardMutationHookResult = ReturnType<typeof useUnstarDashboardMutation>;
export type UnstarDashboardMutationResult = Apollo.MutationResult<UnstarDashboardMutation>;
export type UnstarDashboardMutationOptions = Apollo.BaseMutationOptions<UnstarDashboardMutation, UnstarDashboardMutationVariables>;