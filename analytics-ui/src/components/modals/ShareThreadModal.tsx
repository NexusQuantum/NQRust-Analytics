import React, { useState } from 'react';
import { Modal, Form, Input, Button, Alert, Select, Table, Popconfirm, Tag, Typography } from 'antd';
import { useMutation, useQuery, gql } from '@apollo/client';
import { ModalAction } from '@/hooks/useModalAction';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import UserAddOutlined from '@ant-design/icons/UserAddOutlined';

const { Text } = Typography;

// GraphQL operations for thread sharing
const SHARE_THREAD = gql`
    mutation ShareThread($threadId: ID!, $email: String!, $permission: SharePermission) {
        shareThread(threadId: $threadId, email: $email, permission: $permission) {
            id
            threadId
            userId
            permission
        }
    }
`;

const UNSHARE_THREAD = gql`
    mutation UnshareThread($threadId: ID!, $userId: ID!) {
        unshareThread(threadId: $threadId, userId: $userId)
    }
`;

const GET_THREAD_SHARED_USERS = gql`
    query GetThreadSharedUsers($threadId: ID!) {
        getThreadSharedUsers(threadId: $threadId) {
            id
            threadId
            userId
            permission
            userEmail
            userDisplayName
        }
    }
`;

interface Thread {
    id: number | string;
    name: string;
}

interface SharedUser {
    id: number;
    threadId: number;
    userId: number;
    permission: 'view' | 'edit';
    userEmail: string;
    userDisplayName: string;
}

type Props = ModalAction<Thread | null, any>;

export default function ShareThreadModal({ visible, onClose, defaultValue }: Props) {
    const [form] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const threadId = defaultValue?.id;

    const { data: sharedUsersData, loading: loadingShares, refetch } = useQuery(GET_THREAD_SHARED_USERS, {
        variables: { threadId: String(threadId) },
        skip: !threadId,
    });

    const [shareThread, { loading: shareLoading }] = useMutation(SHARE_THREAD);
    const [unshareThread, { loading: unshareLoading }] = useMutation(UNSHARE_THREAD);

    const sharedUsers: SharedUser[] = sharedUsersData?.getThreadSharedUsers || [];

    const handleShare = async (values: { email: string; permission: 'view' | 'edit' }) => {
        setError(null);
        setSuccess(null);

        try {
            await shareThread({
                variables: {
                    threadId: String(threadId),
                    email: values.email,
                    permission: values.permission.toUpperCase(),
                },
            });
            form.resetFields();
            setSuccess(`Chat shared with ${values.email}`);
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to share chat');
        }
    };

    const handleUnshare = async (userId: number, userEmail: string) => {
        setError(null);
        setSuccess(null);

        try {
            await unshareThread({
                variables: {
                    threadId: String(threadId),
                    userId: String(userId),
                },
            });
            setSuccess(`Removed access for ${userEmail}`);
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to remove share');
        }
    };

    const handleClose = () => {
        setError(null);
        setSuccess(null);
        form.resetFields();
        onClose();
    };

    const columns = [
        {
            title: 'User',
            key: 'user',
            render: (_: any, record: SharedUser) => (
                <div>
                    <Text strong>{record.userDisplayName}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{record.userEmail}</Text>
                </div>
            ),
        },
        {
            title: 'Permission',
            dataIndex: 'permission',
            key: 'permission',
            width: 100,
            render: (permission: string) => (
                <Tag color={permission === 'edit' ? 'blue' : 'default'}>
                    {permission === 'edit' ? 'Can Edit' : 'View Only'}
                </Tag>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 50,
            render: (_: any, record: SharedUser) => (
                <Popconfirm
                    title={`Remove access? ${record.userDisplayName} will no longer be able to view this chat.`}
                    onConfirm={() => handleUnshare(record.userId, record.userEmail)}
                    okText="Remove"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                >
                    <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        danger
                        size="small"
                        loading={unshareLoading}
                    />
                </Popconfirm>
            ),
        },
    ];

    if (!defaultValue) {
        return null;
    }

    return (
        <Modal
            title={`Share "${defaultValue.name}"`}
            visible={visible}
            onCancel={handleClose}
            footer={null}
            width={520}
            destroyOnClose
        >
            <div style={{ padding: '16px 0' }}>
                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ marginBottom: 16 }}
                    />
                )}

                {success && (
                    <Alert
                        message={success}
                        type="success"
                        showIcon
                        closable
                        onClose={() => setSuccess(null)}
                        style={{ marginBottom: 16 }}
                    />
                )}

                {/* Share Form */}
                <Form
                    form={form}
                    layout="inline"
                    onFinish={handleShare}
                    initialValues={{ permission: 'view' }}
                    style={{ marginBottom: 24 }}
                >
                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: 'Enter email' },
                            { type: 'email', message: 'Invalid email format' },
                        ]}
                        style={{ flex: 1 }}
                    >
                        <Input
                            placeholder="Enter email address"
                            prefix={<UserAddOutlined style={{ color: '#bfbfbf' }} />}
                        />
                    </Form.Item>

                    <Form.Item name="permission" style={{ width: 120 }}>
                        <Select>
                            <Select.Option value="view">View Only</Select.Option>
                            <Select.Option value="edit">Can Edit</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={shareLoading}
                            style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                        >
                            Share
                        </Button>
                    </Form.Item>
                </Form>

                {/* Shared Users List */}
                <div>
                    <Text strong style={{ display: 'block', marginBottom: 12 }}>
                        People with access
                    </Text>

                    {sharedUsers.length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 13 }}>
                            This chat has not been shared with anyone yet.
                        </Text>
                    ) : (
                        <Table
                            dataSource={sharedUsers}
                            columns={columns}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            loading={loadingShares}
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
}
