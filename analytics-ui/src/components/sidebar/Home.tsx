import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useParams } from 'next/navigation';
import styled from 'styled-components';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Modal as AntModal } from 'antd';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import { Path } from '@/utils/enum';
import {
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

const HomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

const Section = styled.div<{ $flex?: number }>`
  flex: ${(p) => p.$flex ?? 1} 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const SectionHeader = styled.div`
  flex-shrink: 0;
  padding: 16px 16px 0;
  background: var(--gray-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-8);
`;

const SectionHeaderCount = styled.span`
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
`;

const ScrollContent = styled.div`
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
`;

const SectionDivider = styled.div`
  border-top: 1px solid var(--gray-4);
  flex-shrink: 0;
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
    <HomeContainer>
      {/* Dashboard Section — fixed header + scrollable list */}
      {user && (
        <Section $flex={1}>
          <SectionHeader>
            <span>
              My Dashboards
              <SectionHeaderCount>({dashboards.filter(d => d.createdBy === user.id).length})</SectionHeaderCount>
            </span>
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              onClick={() => dashboardModal.openModal()}
              style={{ fontSize: 12, height: 'auto', color: 'var(--gray-8)' }}
            >
              New
            </Button>
          </SectionHeader>
          <ScrollContent>
            <DashboardTree
              dashboards={dashboards}
              currentUserId={user.id}
              selectedDashboardId={selectedDashboardId}
              hideHeader
              onSelect={handleDashboardSelect}
              onCreateNew={() => dashboardModal.openModal()}
              onEdit={(dashboard) => dashboardModal.openModal(dashboard)}
              onDelete={handleDeleteDashboard}
              onSetDefault={handleSetDefault}
              onStar={handleStarDashboard}
              onUnstar={handleUnstarDashboard}
              onShare={(dashboard) => shareModal.openModal(dashboard)}
            />
          </ScrollContent>
        </Section>
      )}

      <SectionDivider />

      {/* Thread Section — fixed header + scrollable list */}
      <Section $flex={2}>
        <SectionHeader>
          <span>
            History
            <SectionHeaderCount>({threads.length})</SectionHeaderCount>
          </span>
        </SectionHeader>
        <ScrollContent>
          <ThreadTree
            threads={threads}
            selectedKeys={treeSelectedKeys}
            hideHeader
            onSelect={onTreeSelect}
            onRename={onRename}
            onDeleteThread={onDeleteThread}
            onShareThread={handleShareThread}
          />
        </ScrollContent>
      </Section>

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
    </HomeContainer>
  );
}
