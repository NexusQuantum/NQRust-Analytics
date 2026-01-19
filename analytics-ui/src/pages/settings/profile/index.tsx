import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
    Form,
    Input,
    Button,
    Card,
    Typography,
    Divider,
    Avatar,
    Alert,
} from 'antd';
import {
    UserOutlined,
    LockOutlined,
    MailOutlined,
    SaveOutlined,
    ArrowLeftOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { gql, useMutation } from '@apollo/client';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const { Title, Text } = Typography;

const Container = styled.div`
    min-height: 100vh;
    background: #f5f5f5;
    padding: 24px;
`;

const Header = styled.div`
    margin-bottom: 24px;
`;

const ContentCard = styled(Card)`
    max-width: 600px;
    margin: 0 auto;
`;

const AvatarSection = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 24px;
`;

const AvatarInfo = styled.div`
    margin-left: 16px;
`;

const RoleTag = styled.span`
    display: inline-block;
    background: #ff6b35;
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    margin-top: 4px;
    margin-right: 4px;
`;

const TabContainer = styled.div`
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    max-width: 600px;
    margin: 0 auto 24px;
`;

const TabButton = styled.button<{ active: boolean }>`
    padding: 8px 16px;
    border: none;
    background: ${props => props.active ? '#ff6b35' : '#fff'};
    color: ${props => props.active ? '#fff' : '#262626'};
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;

    &:hover {
        background: ${props => props.active ? '#e55a2b' : '#f5f5f5'};
    }
`;

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

function ProfileContent() {
    const router = useRouter();
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
            setTimeout(() => logout(), 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to change password');
        }
    };

    if (!user) {
        return null;
    }

    return (
        <>
            <Head>
                <title>Profile Settings - NQRust Analytics</title>
            </Head>
            <Container>
                <Header>
                    <Button
                        type="text"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => router.back()}
                        style={{ marginBottom: 16 }}
                    >
                        Back
                    </Button>
                    <Title level={2} style={{ margin: 0 }}>Profile Settings</Title>
                    <Text type="secondary">Manage your account settings</Text>
                </Header>

                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                        style={{ maxWidth: 600, margin: '0 auto 16px' }}
                    />
                )}

                {success && (
                    <Alert
                        message={success}
                        type="success"
                        showIcon
                        closable
                        onClose={() => setSuccess(null)}
                        style={{ maxWidth: 600, margin: '0 auto 16px' }}
                    />
                )}

                <TabContainer>
                    <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')}>
                        Profile
                    </TabButton>
                    <TabButton active={activeTab === 'security'} onClick={() => setActiveTab('security')}>
                        Security
                    </TabButton>
                </TabContainer>

                {activeTab === 'profile' && (
                    <ContentCard>
                        <AvatarSection>
                            <Avatar
                                size={80}
                                icon={<UserOutlined />}
                                src={user.avatarUrl}
                                style={{ backgroundColor: '#ff6b35' }}
                            />
                            <AvatarInfo>
                                <Text strong style={{ display: 'block', fontSize: 18 }}>{user.displayName}</Text>
                                <Text type="secondary">{user.email}</Text>
                                <div>
                                    {user.roles?.map(role => (
                                        <RoleTag key={role.id}>{role.name}</RoleTag>
                                    ))}
                                </div>
                            </AvatarInfo>
                        </AvatarSection>

                        <Divider />

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
                                <Input prefix={<UserOutlined />} placeholder="Display name" />
                            </Form.Item>

                            <Form.Item label="Email">
                                <Input
                                    prefix={<MailOutlined />}
                                    value={user.email}
                                    disabled
                                />
                            </Form.Item>

                            <Form.Item>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={updateLoading}
                                    icon={<SaveOutlined />}
                                    style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                                >
                                    Save Changes
                                </Button>
                            </Form.Item>
                        </Form>
                    </ContentCard>
                )}

                {activeTab === 'security' && (
                    <ContentCard>
                        <Title level={4}>Change Password</Title>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
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
                                <Input.Password prefix={<LockOutlined />} placeholder="Current password" />
                            </Form.Item>

                            <Form.Item
                                name="newPassword"
                                label="New Password"
                                rules={[
                                    { required: true, message: 'Please enter a new password' },
                                    { min: 8, message: 'Password must be at least 8 characters' },
                                    {
                                        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                                        message: 'Password must contain uppercase, lowercase, and a number',
                                    },
                                ]}
                            >
                                <Input.Password prefix={<LockOutlined />} placeholder="New password" />
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
                                <Input.Password prefix={<LockOutlined />} placeholder="Confirm new password" />
                            </Form.Item>

                            <Form.Item>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={passwordLoading}
                                    icon={<LockOutlined />}
                                    style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                                >
                                    Change Password
                                </Button>
                            </Form.Item>
                        </Form>
                    </ContentCard>
                )}
            </Container>
        </>
    );
}

export default function ProfilePage() {
    return (
        <ProtectedRoute>
            <ProfileContent />
        </ProtectedRoute>
    );
}
