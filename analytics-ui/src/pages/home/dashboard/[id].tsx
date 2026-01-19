import { useMemo, useRef } from 'react';
import { message } from 'antd';
import { Path } from '@/utils/enum';
import { useRouter } from 'next/router';
import SiderLayout from '@/components/layouts/SiderLayout';
import useHomeSidebar from '@/hooks/useHomeSidebar';
import useDrawerAction from '@/hooks/useDrawerAction';
import useModalAction from '@/hooks/useModalAction';
import { useAuth } from '@/hooks/useAuth';
import { LoadingWrapper } from '@/components/PageLoading';
import DashboardGrid from '@/components/pages/home/dashboardGrid';
import EmptyDashboard from '@/components/pages/home/dashboardGrid/EmptyDashboard';
import DashboardHeader from '@/components/pages/home/dashboardGrid/DashboardHeader';
import CacheSettingsDrawer, {
  Schedule,
} from '@/components/pages/home/dashboardGrid/CacheSettingsDrawer';
import ShareDashboardModal from '@/components/modals/ShareDashboardModal';
import {
  useGetDashboardByIdQuery,
  useDeleteDashboardItemMutation,
  useUpdateDashboardItemLayoutsMutation,
  useSetDashboardScheduleMutation,
} from '@/apollo/client/graphql/dashboard.generated';
import { useGetSettingsQuery } from '@/apollo/client/graphql/settings.generated';
import {
  DataSource,
  DataSourceName,
  ItemLayoutInput,
} from '@/apollo/client/graphql/__types__';

const isSupportCachedSettings = (dataSource: DataSource) => {
  // DuckDB not supported, sample dataset as well
  return (
    !dataSource?.sampleDataset && dataSource?.type !== DataSourceName.DUCKDB
  );
};

export default function DashboardById() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const dashboardGridRef = useRef<{ onRefreshAll: () => void }>(null);
  const homeSidebar = useHomeSidebar();
  const cacheSettingsDrawer = useDrawerAction();
  const shareModal = useModalAction();
  const { data: settingsResult } = useGetSettingsQuery();
  const settings = settingsResult?.settings;
  const isSupportCached = useMemo(
    () => isSupportCachedSettings(settings?.dataSource),
    [settings?.dataSource],
  );

  const {
    data,
    loading,
    updateQuery: updateDashboardQuery,
  } = useGetDashboardByIdQuery({
    variables: { id: id as string },
    skip: !id,
    fetchPolicy: 'cache-and-network',
    onError: () => {
      message.error('Failed to fetch dashboard.');
      router.push(Path.Home);
    },
  });

  const dashboard = data?.dashboard;
  const dashboardItems = useMemo(
    () => dashboard?.items || [],
    [dashboard?.items],
  );

  // Check if current user is the owner
  const isOwner = useMemo(() => {
    if (!user || !dashboard) return false;
    return (dashboard as any).createdBy === user.id;
  }, [user, dashboard]);

  const [setDashboardSchedule] = useSetDashboardScheduleMutation({
    refetchQueries: ['GetDashboardById'],
    onCompleted: () => {
      message.success('Successfully updated dashboard schedule.');
    },
    onError: (error) => console.error(error),
  });

  const [updateDashboardItemLayouts] = useUpdateDashboardItemLayoutsMutation({
    onError: () => {
      message.error('Failed to update dashboard item layouts.');
    },
  });
  const [deleteDashboardItem] = useDeleteDashboardItemMutation({
    onError: (error) => console.error(error),
    onCompleted: (_, query) => {
      message.success('Successfully deleted dashboard item.');
      onRemoveDashboardItemFromQueryCache(query.variables.where.id);
    },
  });

  const onRemoveDashboardItemFromQueryCache = (id: number) => {
    updateDashboardQuery((prev) => {
      return {
        ...prev,
        dashboard: {
          ...prev.dashboard,
          items: prev?.dashboard?.items?.filter((item) => item.id !== id) || [],
        },
      };
    });
  };

  const onUpdateChange = async (layouts: ItemLayoutInput[]) => {
    if (layouts && layouts.length > 0) {
      await updateDashboardItemLayouts({ variables: { data: { layouts } } });
    }
  };

  const onDelete = async (id: number) => {
    await deleteDashboardItem({ variables: { where: { id } } });
  };

  return (
    <SiderLayout loading={false} color="gray-3" sidebar={homeSidebar}>
      <LoadingWrapper loading={loading}>
        <>
          <EmptyDashboard show={dashboardItems.length === 0}>
            <DashboardHeader
              dashboardName={dashboard?.name}
              dashboardDescription={dashboard?.description}
              isOwner={isOwner}
              isSupportCached={isSupportCached}
              schedule={dashboard?.schedule as Schedule}
              nextScheduleTime={dashboard?.nextScheduledAt}
              onCacheSettings={() => {
                cacheSettingsDrawer.openDrawer({
                  cacheEnabled: dashboard?.cacheEnabled,
                  schedule: dashboard?.schedule,
                });
              }}
              onRefreshAll={() => {
                dashboardGridRef?.current?.onRefreshAll();
              }}
              onShare={() => {
                if (dashboard) {
                  shareModal.openModal({
                    id: dashboard.id,
                    name: dashboard.name,
                  });
                }
              }}
            />
            <DashboardGrid
              ref={dashboardGridRef}
              items={dashboardItems}
              isSupportCached={isSupportCached}
              onUpdateChange={onUpdateChange}
              onDelete={onDelete}
            />
          </EmptyDashboard>
          {isSupportCached && (
            <CacheSettingsDrawer
              {...cacheSettingsDrawer.state}
              onClose={cacheSettingsDrawer.closeDrawer}
              onSubmit={async (values) => {
                await setDashboardSchedule({ variables: { data: values } });
              }}
            />
          )}
          <ShareDashboardModal
            visible={shareModal.state.visible}
            onClose={shareModal.closeModal}
            defaultValue={shareModal.state.defaultValue}
          />
        </>
      </LoadingWrapper>
    </SiderLayout>
  );
}
