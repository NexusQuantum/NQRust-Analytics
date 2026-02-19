import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Form, Input, Button, Alert, Typography, Tag, Upload, Divider } from 'antd';
import {
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, gql } from '@apollo/client';
import styles from './license.module.less';

const { Title, Text } = Typography;

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

export default function LicensePage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data, loading: queryLoading, refetch } = useQuery(LICENSE_STATUS_QUERY, {
    fetchPolicy: 'network-only',
  });

  const [activateLicense, { loading: activating }] = useMutation(
    ACTIVATE_LICENSE_MUTATION,
  );

  const licenseState = data?.licenseStatus;

  // Set the license cookie and redirect on success
  const setLicenseCookieAndRedirect = useCallback(async () => {
    try {
      await fetch('/api/license-check');
      router.push('/home');
    } catch {
      router.push('/home');
    }
  }, [router]);

  // If already licensed, set cookie and redirect
  useEffect(() => {
    if (licenseState?.isLicensed && !licenseState?.isGracePeriod) {
      setLicenseCookieAndRedirect();
    }
  }, [licenseState, setLicenseCookieAndRedirect]);

  const handleSubmit = async (values: { licenseKey: string }) => {
    setError(null);

    try {
      const { data: result } = await activateLicense({
        variables: { data: { licenseKey: values.licenseKey.trim().toUpperCase() } },
      });

      const state = result?.activateLicense;
      if (state?.isLicensed) {
        await setLicenseCookieAndRedirect();
      } else {
        setError(state?.errorMessage || 'License activation failed');
        refetch();
      }
    } catch (err: any) {
      const gqlError = err?.graphQLErrors?.[0];
      if (gqlError?.extensions?.code === 'UNAUTHENTICATED') {
        setError('You must be logged in as an admin to activate a license. Please log in first.');
      } else {
        setError(err?.message || 'License activation failed');
      }
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
        const result = await res.json();

        if (!res.ok) {
          setError(result.error || 'Upload failed');
        } else if (result.isLicensed) {
          await setLicenseCookieAndRedirect();
        } else {
          setError(result.errorMessage || 'License file verification failed');
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
    return false;
  };

  const getStatusTag = () => {
    if (!licenseState) return null;
    switch (licenseState.status) {
      case 'active':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Active</Tag>;
      case 'grace_period':
        return <Tag color="warning" icon={<WarningOutlined />}>Grace Period</Tag>;
      case 'expired':
        return <Tag color="error" icon={<CloseCircleOutlined />}>Expired</Tag>;
      case 'invalid':
        return <Tag color="error" icon={<CloseCircleOutlined />}>Invalid</Tag>;
      default:
        return <Tag>Unlicensed</Tag>;
    }
  };

  if (queryLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  const showCurrentLicense =
    licenseState &&
    licenseState.status !== 'unlicensed' &&
    licenseState.status !== 'unknown';

  const infoClass = [
    styles.licenseInfo,
    licenseState?.status === 'expired' ? styles.licenseInfoExpired : '',
    licenseState?.isGracePeriod ? styles.licenseInfoGrace : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Head>
        <title>License Activation - NQRust Analytics</title>
      </Head>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.logo}>
              <img
                src="/images/nexus-analytics-logo-192.png"
                alt="NQRust Analytics"
              />
            </div>
            <Title level={2} className={styles.title}>
              License Activation
            </Title>
            <Text type="secondary">
              Enter your license key to activate NQRust Analytics
            </Text>
          </div>

          {showCurrentLicense && (
            <div className={infoClass}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Status</span>
                <span>{getStatusTag()}</span>
              </div>
              {licenseState.customerName && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Customer</span>
                  <span className={styles.infoValue}>
                    {licenseState.customerName}
                  </span>
                </div>
              )}
              {licenseState.product && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Product</span>
                  <span className={styles.infoValue}>
                    {licenseState.product}
                  </span>
                </div>
              )}
              {licenseState.expiresAt && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Expires</span>
                  <span className={styles.infoValue}>
                    {licenseState.expiresAt}
                  </span>
                </div>
              )}
              {licenseState.isGracePeriod && (
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Grace Period</span>
                  <span className={styles.infoValue}>
                    {licenseState.graceDaysRemaining} days remaining
                  </span>
                </div>
              )}
              {licenseState.activations != null &&
                licenseState.maxActivations != null && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Activations</span>
                    <span className={styles.infoValue}>
                      {licenseState.activations} / {licenseState.maxActivations}
                    </span>
                  </div>
                )}
            </div>
          )}

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              className={styles.alert}
            />
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
            size="large"
          >
            <Form.Item
              name="licenseKey"
              label="License Key"
              rules={[
                { required: true, message: 'Please enter your license key' },
                {
                  pattern: /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/,
                  message: 'License key must be in format XXXX-XXXX-XXXX-XXXX',
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

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={activating}
                block
                className={styles.submitButton}
              >
                Activate License
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ margin: '16px 0' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              or
            </Text>
          </Divider>

          <div className={styles.uploadSection}>
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
              <p className="ant-upload-hint">
                For offline or air-gapped deployments
              </p>
            </Upload.Dragger>
          </div>
        </div>
      </div>
    </>
  );
}
