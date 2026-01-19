import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { DataNode } from 'antd/lib/tree';
import { useRouter } from 'next/router';
import { Dropdown, Menu } from 'antd';
import type { MenuProps } from 'antd';
import SidebarTree, {
    sidebarCommonStyle,
} from '@/components/sidebar/SidebarTree';
import {
    createTreeGroupNode,
    GroupActionButton,
} from '@/components/sidebar/utils';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import FundViewOutlined from '@ant-design/icons/FundViewOutlined';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';
import StarOutlined from '@ant-design/icons/StarOutlined';
import StarFilled from '@ant-design/icons/StarFilled';
import EditOutlined from '@ant-design/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import { Path } from '@/utils/enum';

const StyledSidebarTree = styled(SidebarTree)`
  ${sidebarCommonStyle}

  .adm-treeNode {
    &.adm-treeNode__dashboard {
      padding: 0px 16px 0px 16px !important;

      .ant-tree-title {
        flex-grow: 0 !important;
        
        > * {
          flex-grow: 0 !important;
        }
      }
    }
  }
`;

const DashboardTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;

  .dashboard-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dashboard-icon {
    color: #8c8c8c;
    flex-shrink: 0;
  }

  .default-star {
    color: #faad14;
    font-size: 12px;
    flex-shrink: 0;
  }

  .shared-icon {
    color: #1890ff;
    font-size: 11px;
  }
`;

export interface DashboardData {
    id: number;
    name: string;
    description?: string;
    isDefault: boolean;
    isStarred: boolean;
    createdBy: number;
    creatorEmail?: string;
    creatorDisplayName?: string;
}

interface Props {
    dashboards: DashboardData[];
    currentUserId: number;
    selectedDashboardId: number | null;
    onSelect: (dashboardId: number) => void;
    onCreateNew: () => void;
    onEdit: (dashboard: DashboardData) => void;
    onDelete: (dashboardId: number) => Promise<void>;
    onSetDefault: (dashboardId: number) => Promise<void>;
    onStar: (dashboardId: number) => Promise<void>;
    onUnstar: (dashboardId: number) => Promise<void>;
    onShare: (dashboard: DashboardData) => void;
}

export default function DashboardTree(props: Props) {
    const router = useRouter();
    const {
        dashboards = [],
        currentUserId,
        selectedDashboardId,
        onSelect,
        onCreateNew,
        onEdit,
        onDelete,
        onSetDefault,
        onStar,
        onUnstar,
        onShare,
    } = props;

    // Separate owned vs shared dashboards
    const ownedDashboards = dashboards.filter(d => d.createdBy === currentUserId);
    const sharedDashboards = dashboards.filter(d => d.createdBy !== currentUserId);

    const getContextMenu = (dashboard: DashboardData): MenuProps['items'] => {
        const isOwner = dashboard.createdBy === currentUserId;

        const items: MenuProps['items'] = [];

        // Star/Unstar option - available to all users with access
        if (dashboard.isStarred) {
            items.push({
                key: 'unstar',
                icon: <StarFilled style={{ color: '#faad14' }} />,
                label: 'Remove from Starred',
                onClick: () => onUnstar(dashboard.id),
            });
        } else {
            items.push({
                key: 'star',
                icon: <StarOutlined />,
                label: 'Add to Starred',
                onClick: () => onStar(dashboard.id),
            });
        }

        if (isOwner) {
            items.push(
                { type: 'divider' },
                {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: 'Rename',
                    onClick: () => onEdit(dashboard),
                },
                {
                    key: 'share',
                    icon: <ShareAltOutlined />,
                    label: 'Share',
                    onClick: () => onShare(dashboard),
                }
            );

            if (!dashboard.isDefault) {
                items.push({
                    key: 'setDefault',
                    icon: <StarOutlined />,
                    label: 'Set as Default',
                    onClick: () => onSetDefault(dashboard.id),
                });
            }

            items.push(
                { type: 'divider' },
                {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: 'Delete',
                    danger: true,
                    onClick: () => onDelete(dashboard.id),
                }
            );
        }

        return items;
    };

    const createDashboardNode = (dashboard: DashboardData, isShared: boolean): DataNode => {
        const nodeKey = `dashboard-${dashboard.id}`;
        const menuItems = getContextMenu(dashboard);

        const titleContent = (
            <DashboardTitle>
                <FundViewOutlined className="dashboard-icon" />
                <span className="dashboard-name">{dashboard.name}</span>
                {dashboard.isStarred && <StarFilled className="default-star" />}
                {isShared && <ShareAltOutlined className="shared-icon" />}
            </DashboardTitle>
        );

        return {
            className: 'adm-treeNode adm-treeNode__dashboard',
            key: nodeKey,
            isLeaf: true,
            title: menuItems.length > 0 ? (
                <Dropdown overlay={<Menu items={menuItems} />} trigger={['contextMenu']}>
                    {titleContent}
                </Dropdown>
            ) : titleContent,
        };
    };

    const getOwnedGroupNode = createTreeGroupNode({
        groupName: 'My Dashboards',
        groupKey: 'owned-dashboards',
        actions: [
            {
                key: 'new-dashboard',
                render: () => (
                    <GroupActionButton
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={onCreateNew}
                    >
                        New
                    </GroupActionButton>
                ),
            },
        ],
    });

    const getSharedGroupNode = createTreeGroupNode({
        groupName: 'Shared with Me',
        groupKey: 'shared-dashboards',
        actions: [],
    });

    const [tree, setTree] = useState<DataNode[]>([]);

    useEffect(() => {
        const nodes: DataNode[] = [];

        // Owned dashboards section
        if (ownedDashboards.length > 0 || true) { // Always show section
            nodes.push(
                ...getOwnedGroupNode({
                    quotaUsage: ownedDashboards.length,
                    children: ownedDashboards.map(d => createDashboardNode(d, false)),
                })
            );
        }

        // Shared dashboards section
        if (sharedDashboards.length > 0) {
            nodes.push(
                ...getSharedGroupNode({
                    quotaUsage: sharedDashboards.length,
                    children: sharedDashboards.map(d => createDashboardNode(d, true)),
                })
            );
        }

        setTree(nodes);
    }, [dashboards, currentUserId]);

    const handleSelect = (selectedKeys: React.Key[]) => {
        if (selectedKeys.length === 0) return;

        const key = selectedKeys[0] as string;
        if (key.startsWith('dashboard-')) {
            const id = parseInt(key.replace('dashboard-', ''), 10);
            onSelect(id);
            router.push(`${Path.HomeDashboard}/${id}`);
        }
    };

    return (
        <StyledSidebarTree
            treeData={tree}
            selectedKeys={selectedDashboardId ? [`dashboard-${selectedDashboardId}`] : []}
            onSelect={handleSelect}
            defaultExpandAll
        />
    );
}
