import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useParams } from 'next/navigation';
import styled from 'styled-components';
import { useMutation, useQuery } from '@apollo/client';
import { Modal as AntModal } from 'antd';
import { Path } from '@/utils/enum';
import SidebarTree, {
  useSidebarTreeState,
} from './SidebarTree';
import ThreadTree, { ThreadData } from './home/ThreadTree';
import DashboardTree, { DashboardData } from './home/DashboardTree';
import DashboardModal from '@/components/modals/DashboardModal';
import ShareDashboardModal from '@/components/modals/ShareDashboardModal';
import ShareThreadModal from '@/components/modals/ShareThreadModal';
import useModalAction from '@/hooks/useModalAction';
import { useAuth } from '@/hooks/useAuth';
import {
  LIST_DASHBOARDS,
  DELETE_DASHBOARD,
  SET_DEFAULT_DASHBOARD,
  STAR_DASHBOARD,
  UNSTAR_DASHBOARD,
} from '@/apollo/client/graphql/dashboard';

export interface Props {
  data: {
    threads: ThreadData[];
  };
  onSelect: (selectKeys: React.Key[]) => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, newName: string) => Promise<void>;
}

export const StyledSidebarTree = styled(SidebarTree)`
  .adm-treeNode {
    &.adm-treeNode__thread {
      padding: 0px 16px 0px 4px !important;

      .ant-tree-title {
        flex-grow: 1;
        display: inline-flex;
        align-items: center;
        span:first-child,
        .adm-treeTitle__title {
          flex-grow: 1;
        }
      }
    }
  }
`;

export default function Home(props: Props) {
  const { data, onSelect, onRename, onDelete } = props;
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { threads } = data;
  const { user } = useAuth();

  const { treeSelectedKeys, setTreeSelectedKeys } = useSidebarTreeState();

  // Dashboard state
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);

  // Fetch dashboards
  const { data: dashboardsData } = useQuery(LIST_DASHBOARDS);
  const dashboards: DashboardData[] = dashboardsData?.dashboards || [];

  // Mutations
  const [deleteDashboard] = useMutation(DELETE_DASHBOARD, {
    refetchQueries: [{ query: LIST_DASHBOARDS }],
  });
  const [setDefaultDashboard] = useMutation(SET_DEFAULT_DASHBOARD, {
    refetchQueries: [{ query: LIST_DASHBOARDS }],
  });
  const [starDashboard] = useMutation(STAR_DASHBOARD, {
    refetchQueries: [{ query: LIST_DASHBOARDS }],
  });
  const [unstarDashboard] = useMutation(UNSTAR_DASHBOARD, {
    refetchQueries: [{ query: LIST_DASHBOARDS }],
  });

  // Modals
  const dashboardModal = useModalAction();
  const shareModal = useModalAction();
  const shareThreadModal = useModalAction();

  useEffect(() => {
    params?.id && setTreeSelectedKeys([params.id] as string[]);
  }, [params?.id]);

  const onDeleteThread = async (threadId: string) => {
    try {
      await onDelete(threadId);
      if (params?.id == threadId) {
        router.push(Path.Home);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const onTreeSelect = (selectedKeys: React.Key[], _info: any) => {
    if (selectedKeys.length === 0) return;
    setTreeSelectedKeys(selectedKeys);
    onSelect(selectedKeys);
  };

  const handleDashboardSelect = (dashboardId: number) => {
    setSelectedDashboardId(dashboardId);
  };

  const handleDeleteDashboard = async (dashboardId: number) => {
    AntModal.confirm({
      title: 'Delete Dashboard',
      content: 'Are you sure you want to delete this dashboard? This action cannot be undone.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteDashboard({ variables: { id: dashboardId } });
        if (selectedDashboardId === dashboardId) {
          setSelectedDashboardId(null);
          router.push(Path.HomeDashboard);
        }
      },
    });
  };

  const handleSetDefault = async (dashboardId: number) => {
    await setDefaultDashboard({ variables: { id: dashboardId } });
  };

  const handleStarDashboard = async (dashboardId: number) => {
    await starDashboard({ variables: { dashboardId } });
  };

  const handleUnstarDashboard = async (dashboardId: number) => {
    await unstarDashboard({ variables: { dashboardId } });
  };

  const handleShareThread = (threadId: string, threadName: string) => {
    shareThreadModal.openModal({ id: threadId, name: threadName });
  };

  return (
    <>
      {/* Dashboard Section */}
      {user && (
        <DashboardTree
          dashboards={dashboards}
          currentUserId={user.id}
          selectedDashboardId={selectedDashboardId}
          onSelect={handleDashboardSelect}
          onCreateNew={() => dashboardModal.openModal()}
          onEdit={(dashboard) => dashboardModal.openModal(dashboard)}
          onDelete={handleDeleteDashboard}
          onSetDefault={handleSetDefault}
          onStar={handleStarDashboard}
          onUnstar={handleUnstarDashboard}
          onShare={(dashboard) => shareModal.openModal(dashboard)}
        />
      )}

      {/* Thread Section */}
      <ThreadTree
        threads={threads}
        selectedKeys={treeSelectedKeys}
        onSelect={onTreeSelect}
        onRename={onRename}
        onDeleteThread={onDeleteThread}
        onShareThread={handleShareThread}
      />

      {/* Modals */}
      <DashboardModal
        visible={dashboardModal.state.visible}
        onClose={dashboardModal.closeModal}
        defaultValue={dashboardModal.state.defaultValue}
      />
      <ShareDashboardModal
        visible={shareModal.state.visible}
        onClose={shareModal.closeModal}
        defaultValue={shareModal.state.defaultValue}
      />
      <ShareThreadModal
        visible={shareThreadModal.state.visible}
        onClose={shareThreadModal.closeModal}
        defaultValue={shareThreadModal.state.defaultValue}
      />
    </>
  );
}
