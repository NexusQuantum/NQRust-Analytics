import { useState, useEffect } from 'react';
import { Modal, Select, Button, Input, Form, message, Divider } from 'antd';
import { useQuery, useMutation } from '@apollo/client';
import { PlusOutlined } from '@ant-design/icons';
import {
  LIST_DASHBOARDS,
  CREATE_DASHBOARD,
} from '@/apollo/client/graphql/dashboard';
import type { DashboardData } from '@/components/sidebar/home/DashboardTree';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (dashboardId: number | null) => Promise<void>;
  loading?: boolean;
}

export default function PinToDashboardModal(props: Props) {
  const { visible, onClose, onConfirm, loading = false } = props;
  const [selectedDashboardId, setSelectedDashboardId] = useState<number | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');
  const [creating, setCreating] = useState(false);

  // Fetch dashboards
  const { data: dashboardsData, refetch } = useQuery(LIST_DASHBOARDS, {
    skip: !visible,
  });
  const dashboards: DashboardData[] = dashboardsData?.dashboards || [];

  // Create dashboard mutation
  const [createDashboard] = useMutation(CREATE_DASHBOARD, {
    refetchQueries: [{ query: LIST_DASHBOARDS }],
  });

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      // Select the default dashboard initially
      const defaultDashboard = dashboards.find(d => d.isDefault);
      if (defaultDashboard) {
        setSelectedDashboardId(defaultDashboard.id);
      } else if (dashboards.length > 0) {
        setSelectedDashboardId(dashboards[0].id);
      }
      setShowCreateNew(false);
      setNewDashboardName('');
    }
  }, [visible, dashboards]);

  const handleCreateNewDashboard = async () => {
    if (!newDashboardName.trim()) {
      message.error('Please enter a dashboard name');
      return;
    }

    setCreating(true);
    try {
      const result = await createDashboard({
        variables: {
          data: {
            name: newDashboardName.trim(),
          },
        },
      });
      
      const newDashboard = result.data?.createDashboard;
      if (newDashboard) {
        setSelectedDashboardId(newDashboard.id);
        setShowCreateNew(false);
        setNewDashboardName('');
        message.success('Dashboard created successfully');
        await refetch();
      }
    } catch (error) {
      console.error(error);
      message.error('Failed to create dashboard');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async () => {
    await onConfirm(selectedDashboardId);
    onClose();
  };

  return (
    <Modal
      title="Pin Chart to Dashboard"
      visible={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="confirm"
          type="primary"
          loading={loading}
          onClick={handleConfirm}
          disabled={!selectedDashboardId && !showCreateNew}
        >
          Pin to Dashboard
        </Button>,
      ]}
    >
      <div className="mb-4">
        <p className="text-sm gray-7 mb-2">
          Select a dashboard to pin this chart to:
        </p>
        <Select
          style={{ width: '100%' }}
          value={selectedDashboardId}
          onChange={(value) => setSelectedDashboardId(value)}
          placeholder="Select a dashboard"
          dropdownRender={(menu) => (
            <>
              {menu}
              <Divider style={{ margin: '8px 0' }} />
              <div
                className="d-flex align-center px-2 py-1 cursor-pointer"
                style={{ color: 'var(--rust-orange-6)' }}
                onClick={() => setShowCreateNew(true)}
              >
                <PlusOutlined className="mr-2" />
                Create New Dashboard
              </div>
            </>
          )}
        >
          {dashboards.map((dashboard) => (
            <Select.Option key={dashboard.id} value={dashboard.id}>
              <div className="d-flex align-center justify-content-between">
                <span>{dashboard.name}</span>
                {dashboard.isDefault && (
                  <span className="text-xs gray-6">(Default)</span>
                )}
              </div>
            </Select.Option>
          ))}
        </Select>
      </div>

      {showCreateNew && (
        <div className="mt-4 p-3 bg-gray-2 rounded">
          <p className="text-sm text-medium mb-2">Create New Dashboard</p>
          <Input
            placeholder="Dashboard name"
            value={newDashboardName}
            onChange={(e) => setNewDashboardName(e.target.value)}
            onPressEnter={handleCreateNewDashboard}
          />
          <div className="d-flex justify-content-end mt-2">
            <Button
              size="small"
              className="mr-2"
              onClick={() => {
                setShowCreateNew(false);
                setNewDashboardName('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="primary"
              loading={creating}
              onClick={handleCreateNewDashboard}
            >
              Create
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
