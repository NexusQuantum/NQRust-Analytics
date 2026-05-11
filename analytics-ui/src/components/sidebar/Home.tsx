import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useParams } from 'next/navigation';
import styled from 'styled-components';
import { useMutation, useQuery } from '@apollo/client';
import { Modal as AntModal, Button } from 'antd';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import { Path } from '@/utils/enum';
import SidebarTree, {
  useSidebarTreeState,
} from './SidebarTree';
import ThreadTree, { ThreadData } from './home/ThreadTree';
import DashboardTree, { DashboardData } from './home/DashboardTree';
import SourcesPanel from './home/SourcesPanel';
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

const HomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
`;

const Section = styled.div<{ $flex: number }>`
  display: flex;
  flex-direction: column;
  flex: ${(p) => p.$flex} 1 0;
  min-height: 0;
  border-bottom: 1px solid var(--gray-4);

  &:last-child {
    border-bottom: none;
  }
`;

const SectionHeader = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--gray-7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const SectionTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  .count {
    color: var(--gray-6);
    font-weight: 400;
  }
`;

const HeaderActionButton = styled(Button)`
  font-size: 12px;
  height: auto;
  padding: 0 6px;
  background: transparent;
  color: var(--gray-8);
  display: flex;
  align-items: center;
  gap: 2px;
  &:hover {
    background-color: transparent;
    color: var(--gray-9);
  }
`;

const ScrollContent = styled.div`
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 8px;
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
  const ownedDashboardCount = user
    ? dashboards.filter((d) => d.createdBy === user.id).length
    : 0;

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
  const [uploadOpen, setUploadOpen] = useState(false);

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
      <HomeContainer>
        {/* My Dashboards */}
        <Section $flex={1}>
          <SectionHeader>
            <SectionTitle>
              My Dashboards <span className="count">({ownedDashboardCount})</span>
            </SectionTitle>
            <HeaderActionButton
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => dashboardModal.openModal()}
            >
              New
            </HeaderActionButton>
          </SectionHeader>
          <ScrollContent>
            {user && (
              <DashboardTree
                hideHeader
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
          </ScrollContent>
        </Section>

        {/* History */}
        <Section $flex={2}>
          <SectionHeader>
            <SectionTitle>
              History <span className="count">({threads.length})</span>
            </SectionTitle>
          </SectionHeader>
          <ScrollContent>
            <ThreadTree
              hideHeader
              threads={threads}
              selectedKeys={treeSelectedKeys}
              onSelect={onTreeSelect}
              onRename={onRename}
              onDeleteThread={onDeleteThread}
              onShareThread={handleShareThread}
            />
          </ScrollContent>
        </Section>

        {/* Sources */}
        <Section $flex={1}>
          <SectionHeader>
            <SectionTitle>Sources</SectionTitle>
            <HeaderActionButton
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              Add
            </HeaderActionButton>
          </SectionHeader>
          <ScrollContent>
            <SourcesPanel
              uploadOpen={uploadOpen}
              onUploadClose={() => setUploadOpen(false)}
            />
          </ScrollContent>
        </Section>
      </HomeContainer>

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
