import { useEffect } from 'react';
import { Button, Space, Typography, message } from 'antd';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { SyncStatus } from '@/apollo/client/graphql/__types__';
import { useDeployMutation } from '@/apollo/client/graphql/deploy.generated';
import { useDeployStatusContext } from '@/components/deploy/Context';
import LoadingOutlined from '@ant-design/icons/LoadingOutlined';

const { Text } = Typography;

const getDeployStatus = (deploying: boolean, status: SyncStatus) => {
  const syncStatus = deploying ? SyncStatus.IN_PROGRESS : status;

  return (
    {
      [SyncStatus.IN_PROGRESS]: (
        <Space size={[4, 0]}>
          <LoadingOutlined className="mr-1 gray-5" />
          <Text className="gray-8">Deploying...</Text>
        </Space>
      ),
      [SyncStatus.SYNCRONIZED]: (
        <Space size={[4, 0]}>
          <CheckCircle className="mr-1 green-7" size={16} />
          <Text className="gray-8">Synced</Text>
        </Space>
      ),
      [SyncStatus.UNSYNCRONIZED]: (
        <Space size={[4, 0]}>
          <AlertTriangle className="mr-1 gold-6" size={16} />
          <Text className="gray-8">Undeployed changes</Text>
        </Space>
      ),
    }[syncStatus] || ''
  );
};

export default function Deploy() {
  const deployContext = useDeployStatusContext();
  const { data, loading, startPolling, stopPolling } = deployContext;

  const [deployMutation, { data: deployResult, loading: deploying }] =
    useDeployMutation({
      onError: (error) => console.error(error),
      onCompleted: (data) => {
        if (data.deploy?.status === 'FAILED') {
          console.error('Failed to deploy - ', data.deploy?.error);
          message.error(
            'Failed to deploy. Please check the log for more details.',
          );
        }
      },
    });

  useEffect(() => {
    // Stop polling deploy status if deploy failed
    if (
      deployResult?.deploy?.status === 'FAILED' &&
      data?.modelSync.status === SyncStatus.UNSYNCRONIZED
    ) {
      stopPolling();
    }
  }, [deployResult, data]);

  const syncStatus = data?.modelSync.status;

  const onDeploy = () => {
    deployMutation();
    startPolling(1000);
  };

  useEffect(() => {
    if (syncStatus === SyncStatus.SYNCRONIZED) stopPolling();
  }, [syncStatus]);

  const disabled =
    deploying ||
    loading ||
    [SyncStatus.SYNCRONIZED, SyncStatus.IN_PROGRESS].includes(syncStatus);

  return (
    <Space size={[8, 0]} className="mt-2 ml-2 px-2">
      {getDeployStatus(deploying, syncStatus)}
      <Button
        className={`adm-modeling-header-btn ${disabled ? '' : 'gray-10'}`}
        disabled={disabled}
        onClick={() => onDeploy()}
        size="small"
        data-guideid="deploy-model"
      >
        Deploy
      </Button>
    </Space>
  );
}
