import { useState } from 'react';
import { Form, Input, Button, Alert, Tag, Upload, message, Divider } from 'antd';
import {
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  SyncOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, gql } from '@apollo/client';

const LICENSE_STATUS_QUERY = gql`
  query LicenseStatus {
    licenseStatus {
      isLicensed
      status
      isGracePeriod
      graceDaysRemaining
      customerName
      product
      features
      expiresAt
      activations
      maxActivations
      verifiedAt
      licenseKey
      errorMessage
    }
  }
`;

const ACTIVATE_LICENSE_MUTATION = gql`
  mutation ActivateLicense($data: ActivateLicenseInput!) {
    activateLicense(data: $data) {
      isLicensed
      status
      isGracePeriod
      graceDaysRemaining
      customerName
      product
      features
      expiresAt
      activations
      maxActivations
      verifiedAt
      licenseKey
      errorMessage
    }
  }
`;

const REFRESH_LICENSE_MUTATION = gql`
  mutation RefreshLicense {
    refreshLicense {
      isLicensed
      status
      isGracePeriod
      graceDaysRemaining
      customerName
      product
      features
      expiresAt
      activations
      maxActivations
      verifiedAt
      licenseKey
      errorMessage
    }
  }
`;

const getStatusTag = (status: string, isGracePeriod: boolean) => {
  if (isGracePeriod) {
    return (
      <Tag color="warning" icon={<WarningOutlined />}>
        Grace Period
      </Tag>
    );
  }
  switch (status) {
    case 'active':
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          Active
        </Tag>
      );
    case 'expired':
      return (
        <Tag color="error" icon={<CloseCircleOutlined />}>
          Expired
        </Tag>
      );
    case 'invalid':
      return (
        <Tag color="error" icon={<CloseCircleOutlined />}>
          Invalid
        </Tag>
      );
    default:
      return <Tag>Unlicensed</Tag>;
  }
};

export default function LicenseSettings() {
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const {
    data,
    loading: queryLoading,
    refetch,
  } = useQuery(LICENSE_STATUS_QUERY, {
    fetchPolicy: 'network-only',
  });

  const [activateLicense, { loading: activating }] = useMutation(
    ACTIVATE_LICENSE_MUTATION,
  );

  const [refreshLicense, { loading: refreshing }] = useMutation(
    REFRESH_LICENSE_MUTATION,
  );

  const licenseState = data?.licenseStatus;

  const showCurrentLicense =
    licenseState &&
    licenseState.status !== 'unlicensed' &&
    licenseState.status !== 'unknown';

  const handleActivate = async (values: { licenseKey: string }) => {
    setError(null);
    try {
      const { data: result } = await activateLicense({
        variables: {
          data: { licenseKey: values.licenseKey.trim().toUpperCase() },
        },
      });
      const state = result?.activateLicense;
      if (state?.isLicensed) {
        message.success('License activated successfully');
        form.resetFields();
        refetch();
        // Refresh the license cookie
        fetch('/api/license-check').catch(() => {});
      } else {
        setError(state?.errorMessage || 'License activation failed');
      }
    } catch (err: any) {
      setError(err?.message || 'License activation failed');
    }
  };

  const handleRefresh = async () => {
    setError(null);
    try {
      const { data: result } = await refreshLicense();
      const state = result?.refreshLicense;
      if (state?.isLicensed) {
        message.success('License verified successfully');
      } else {
        setError(state?.errorMessage || 'License verification failed');
      }
      refetch();
      fetch('/api/license-check').catch(() => {});
    } catch (err: any) {
      setError(err?.message || 'Failed to refresh license');
    }
  };

  const handleLicFileUpload = (file: File) => {
    setError(null);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const res = await fetch('/api/license-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Upload failed');
        } else if (data.isLicensed) {
          message.success('License file activated successfully');
          refetch();
        } else {
          setError(data.errorMessage || 'License file verification failed');
          refetch();
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to upload license file');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setUploading(false);
    };
    reader.readAsText(file);

    // Prevent default upload behavior
    return false;
  };

  if (queryLoading) {
    return <div className="py-3 px-4 gray-7">Loading license status...</div>;
  }

  return (
    <div className="py-3 px-4">
      {showCurrentLicense && (
        <>
          <div className="mb-3">
            <div className="d-flex align-center justify-space-between mb-2">
              <span className="gray-9 text-bold">Current License</span>
              <Button
                size="small"
                icon={<SyncOutlined spin={refreshing} />}
                onClick={handleRefresh}
                loading={refreshing}
              >
                Refresh
              </Button>
            </div>

            <div
              style={{
                background: '#fafafa',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #f0f0f0',
              }}
            >
              <div className="d-flex justify-space-between mb-2">
                <span className="gray-7">Status</span>
                <span>
                  {getStatusTag(
                    licenseState.status,
                    licenseState.isGracePeriod,
                  )}
                </span>
              </div>

              {licenseState.licenseKey && (
                <div className="d-flex justify-space-between mb-2">
                  <span className="gray-7">License Key</span>
                  <span className="gray-9" style={{ fontFamily: 'monospace' }}>
                    {licenseState.licenseKey}
                  </span>
                </div>
              )}

              {licenseState.customerName && (
                <div className="d-flex justify-space-between mb-2">
                  <span className="gray-7">Customer</span>
                  <span className="gray-9">{licenseState.customerName}</span>
                </div>
              )}

              {licenseState.product && (
                <div className="d-flex justify-space-between mb-2">
                  <span className="gray-7">Product</span>
                  <span className="gray-9">{licenseState.product}</span>
                </div>
              )}

              {licenseState.expiresAt && (
                <div className="d-flex justify-space-between mb-2">
                  <span className="gray-7">Expires</span>
                  <span className="gray-9">{licenseState.expiresAt}</span>
                </div>
              )}

              {licenseState.isGracePeriod && (
                <div className="d-flex justify-space-between mb-2">
                  <span className="gray-7">Grace Period</span>
                  <span className="gray-9">
                    {licenseState.graceDaysRemaining} days remaining
                  </span>
                </div>
              )}

              {licenseState.activations != null &&
                licenseState.maxActivations != null && (
                  <div className="d-flex justify-space-between mb-2">
                    <span className="gray-7">Activations</span>
                    <span className="gray-9">
                      {licenseState.activations} /{' '}
                      {licenseState.maxActivations}
                    </span>
                  </div>
                )}

              {licenseState.verifiedAt && (
                <div className="d-flex justify-space-between">
                  <span className="gray-7">Last Verified</span>
                  <span className="gray-9">
                    {new Date(licenseState.verifiedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <Divider style={{ margin: '16px 0' }} />
        </>
      )}

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          closable
          onClose={() => setError(null)}
          className="mb-3"
        />
      )}

      <div className="gray-9 text-bold mb-2">
        {showCurrentLicense ? 'Change License Key' : 'Activate License'}
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleActivate}
        requiredMark={false}
      >
        <Form.Item
          name="licenseKey"
          rules={[
            { required: true, message: 'Please enter your license key' },
            {
              pattern:
                /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/,
              message: 'Format: XXXX-XXXX-XXXX-XXXX',
            },
          ]}
        >
          <Input
            prefix={<KeyOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            maxLength={19}
            autoComplete="off"
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 12 }}>
          <Button type="primary" htmlType="submit" loading={activating}>
            Activate License
          </Button>
        </Form.Item>
      </Form>

      <Divider style={{ margin: '16px 0' }} />

      <div className="gray-9 text-bold mb-2">Upload License File</div>
      <div className="gray-6 mb-2" style={{ fontSize: 12 }}>
        For offline or air-gapped deployments, upload your .lic certificate
        file.
      </div>
      <Upload.Dragger
        accept=".lic"
        maxCount={1}
        showUploadList={false}
        beforeUpload={handleLicFileUpload}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          <UploadOutlined style={{ fontSize: 32, color: '#999' }} />
        </p>
        <p className="ant-upload-text">
          {uploading
            ? 'Verifying license...'
            : 'Click or drag .lic file to upload'}
        </p>
      </Upload.Dragger>
    </div>
  );
}
