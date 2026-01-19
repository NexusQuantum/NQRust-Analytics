import React, { useState } from 'react';
import { Modal, Form, Input, Button, Typography, Alert } from 'antd';
import { gql, useMutation } from '@apollo/client';
import { useAuth } from '@/hooks/useAuth';
import { ModalAction } from '@/hooks/useModalAction';

const { Title, Text } = Typography;

const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($data: ChangePasswordInput!) {
    changePassword(data: $data)
  }
`;

const UPDATE_USER_MUTATION = gql`
  mutation UpdateUser($where: UserWhereInput!, $data: UpdateUserInput!) {
    updateUser(where: $where, data: $data) {
      id
      displayName
      avatarUrl
    }
  }
`;

type Props = ModalAction<any, any>;

export default function ProfileModal({ visible, onClose }: Props) {
    const { user, refreshUser, logout } = useAuth();
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');

    const [changePassword, { loading: passwordLoading }] = useMutation(CHANGE_PASSWORD_MUTATION);
    const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION);

    const handleProfileSubmit = async (values: { displayName: string }) => {
        setError(null);
        setSuccess(null);

        try {
            await updateUser({
                variables: {
                    where: { id: user?.id },
                    data: { displayName: values.displayName },
                },
            });
            await refreshUser();
            setSuccess('Profile updated successfully!');
        } catch (err: any) {
            setError(err.message || 'Failed to update profile');
        }
    };

    const handlePasswordSubmit = async (values: { oldPassword: string; newPassword: string }) => {
        setError(null);
        setSuccess(null);

        try {
            await changePassword({
                variables: {
                    data: {
                        oldPassword: values.oldPassword,
                        newPassword: values.newPassword,
                    },
                },
            });
            passwordForm.resetFields();
            setSuccess('Password changed successfully! You will be logged out.');
            setTimeout(() => {
                logout();
                onClose();
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to change password');
        }
    };

    const handleClose = () => {
        setError(null);
        setSuccess(null);
        setActiveTab('profile');
        profileForm.resetFields();
        passwordForm.resetFields();
        onClose();
    };

    if (!user) {
        return null;
    }

    return (
        <Modal
            title="Profile Settings"
            visible={visible}
            onCancel={handleClose}
            footer={null}
            width={500}
            destroyOnClose
        >
            <div style={{ padding: 16 }}>
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

                <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #f0f0f0', paddingBottom: 16 }}>
                    <button
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            background: activeTab === 'profile' ? '#ff6b35' : 'transparent',
                            color: activeTab === 'profile' ? '#fff' : '#262626',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 500,
                        }}
                        onClick={() => setActiveTab('profile')}
                    >
                        Profile
                    </button>
                    <button
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            background: activeTab === 'security' ? '#ff6b35' : 'transparent',
                            color: activeTab === 'security' ? '#fff' : '#262626',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 500,
                        }}
                        onClick={() => setActiveTab('security')}
                    >
                        Security
                    </button>
                </div>

                {activeTab === 'profile' && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 64,
                                height: 64,
                                borderRadius: '50%',
                                backgroundColor: '#ff6b35',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 24,
                                fontWeight: 600,
                            }}>
                                {user.displayName?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div style={{ marginLeft: 16 }}>
                                <Text strong style={{ display: 'block', fontSize: 16 }}>{user.displayName}</Text>
                                <Text type="secondary" style={{ fontSize: 13 }}>{user.email}</Text>
                                <div>
                                    {user.roles?.map(role => (
                                        <span
                                            key={role.id}
                                            style={{
                                                display: 'inline-block',
                                                background: '#ff6b35',
                                                color: '#fff',
                                                padding: '2px 8px',
                                                borderRadius: 4,
                                                fontSize: 12,
                                                marginTop: 4,
                                                marginRight: 4,
                                            }}
                                        >
                                            {role.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <Form
                            form={profileForm}
                            layout="vertical"
                            onFinish={handleProfileSubmit}
                            initialValues={{ displayName: user.displayName }}
                        >
                            <Form.Item
                                name="displayName"
                                label="Display Name"
                                rules={[
                                    { required: true, message: 'Please enter your display name' },
                                    { min: 2, message: 'Name must be at least 2 characters' },
                                ]}
                            >
                                <Input placeholder="Display name" />
                            </Form.Item>

                            <Form.Item label="Email">
                                <Input
                                    value={user.email}
                                    disabled
                                />
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 0 }}>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={updateLoading}
                                    style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                                >
                                    Save Changes
                                </Button>
                            </Form.Item>
                        </Form>
                    </div>
                )}

                {activeTab === 'security' && (
                    <div>
                        <Title level={5} style={{ marginBottom: 8 }}>Change Password</Title>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
                            Choose a strong password that you don't use elsewhere.
                        </Text>

                        <Form
                            form={passwordForm}
                            layout="vertical"
                            onFinish={handlePasswordSubmit}
                        >
                            <Form.Item
                                name="oldPassword"
                                label="Current Password"
                                rules={[{ required: true, message: 'Please enter your current password' }]}
                            >
                                <Input.Password placeholder="Current password" />
                            </Form.Item>

                            <Form.Item
                                name="newPassword"
                                label="New Password"
                                rules={[
                                    { required: true, message: 'Please enter a new password' },
                                    { min: 8, message: 'Password must be at least 8 characters' },
                                ]}
                            >
                                <Input.Password placeholder="New password" />
                            </Form.Item>

                            <Form.Item
                                name="confirmPassword"
                                label="Confirm New Password"
                                dependencies={['newPassword']}
                                rules={[
                                    { required: true, message: 'Please confirm your new password' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newPassword') === value) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error('Passwords do not match'));
                                        },
                                    }),
                                ]}
                            >
                                <Input.Password placeholder="Confirm new password" />
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 0 }}>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={passwordLoading}
                                    style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                                >
                                    Change Password
                                </Button>
                            </Form.Item>
                        </Form>
                    </div>
                )}
            </div>
        </Modal>
    );
}
