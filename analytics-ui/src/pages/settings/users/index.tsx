import React, { useState } from 'react';
import Head from 'next/head';
import {
    Table,
    Card,
    Typography,
    Button,
    Space,
    Tag,
    Modal,
    Form,
    Input,
    Select,
    message,
    Alert,
    Popconfirm,
    Avatar,
} from 'antd';
import {
    UserOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    MailOutlined,
    LockOutlined,
} from '@ant-design/icons';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import styles from './users.module.less';

const { Title, Text } = Typography;

const USERS_QUERY = gql`
  query Users {
    users {
      id
      email
      displayName
      avatarUrl
      isActive
      isVerified
      createdAt
      lastLoginAt
      roles {
        id
        name
      }
    }
  }
`;

const ROLES_QUERY = gql`
  query Roles {
    roles {
      id
      name
      description
    }
  }
`;

const CREATE_USER_MUTATION = gql`
  mutation CreateUser($data: CreateUserInput!) {
    createUser(data: $data) {
      id
      email
      displayName
    }
  }
`;

const UPDATE_USER_MUTATION = gql`
  mutation UpdateUser($where: UserWhereInput!, $data: UpdateUserInput!) {
    updateUser(where: $where, data: $data) {
      id
      displayName
      isActive
      roles {
        id
        name
      }
    }
  }
`;

const DELETE_USER_MUTATION = gql`
  mutation DeleteUser($where: UserWhereInput!) {
    deleteUser(where: $where)
  }
`;

interface User {
    id: number;
    email: string;
    displayName: string;
    avatarUrl?: string;
    isActive: boolean;
    isVerified: boolean;
    createdAt: string;
    lastLoginAt?: string;
    roles: { id: number; name: string }[];
}

interface Role {
    id: number;
    name: string;
    description?: string;
}

function UserManagementContent() {
    const { user: currentUser } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [form] = Form.useForm();

    const { data: usersData, loading: usersLoading, refetch } = useQuery(USERS_QUERY);
    const { data: rolesData } = useQuery(ROLES_QUERY);

    const [createUser, { loading: createLoading }] = useMutation(CREATE_USER_MUTATION);
    const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION);
    const [deleteUser] = useMutation(DELETE_USER_MUTATION);

    const users: User[] = usersData?.users || [];
    const roles: Role[] = rolesData?.roles || [];

    const handleOpenModal = (user?: User) => {
        setEditingUser(user || null);
        if (user) {
            form.setFieldsValue({
                displayName: user.displayName,
                email: user.email,
                isActive: user.isActive,
                roleIds: user.roles.map(r => r.id),
            });
        } else {
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        form.resetFields();
        setError(null);
    };

    const handleSubmit = async (values: any) => {
        setError(null);
        try {
            if (editingUser) {
                await updateUser({
                    variables: {
                        where: { id: editingUser.id },
                        data: {
                            displayName: values.displayName,
                            isActive: values.isActive,
                            roleIds: values.roleIds,
                        },
                    },
                });
                message.success('User updated successfully');
            } else {
                await createUser({
                    variables: {
                        data: {
                            email: values.email,
                            password: values.password,
                            displayName: values.displayName,
                            roleIds: values.roleIds,
                        },
                    },
                });
                message.success('User created successfully');
            }
            refetch();
            handleCloseModal();
        } catch (err: any) {
            setError(err.message || 'Operation failed');
        }
    };

    const handleDelete = async (userId: number) => {
        try {
            await deleteUser({
                variables: { where: { id: userId } },
            });
            message.success('User deleted successfully');
            refetch();
        } catch (err: any) {
            message.error(err.message || 'Failed to delete user');
        }
    };

    const columns = [
        {
            title: 'User',
            key: 'user',
            render: (_: any, record: User) => (
                <Space>
                    <Avatar icon={<UserOutlined />} src={record.avatarUrl} />
                    <div>
                        <div className={styles.userName}>{record.displayName}</div>
                        <Text type="secondary" className={styles.userEmail}>{record.email}</Text>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Roles',
            key: 'roles',
            render: (_: any, record: User) => (
                <Space wrap>
                    {record.roles.map(role => (
                        <Tag
                            key={role.id}
                            color={role.name === 'admin' ? 'purple' : 'blue'}
                        >
                            {role.name}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_: any, record: User) => (
                <Tag color={record.isActive ? 'green' : 'red'}>
                    {record.isActive ? 'Active' : 'Inactive'}
                </Tag>
            ),
        },
        {
            title: 'Last Login',
            key: 'lastLogin',
            render: (_: any, record: User) => (
                <Text type="secondary">
                    {record.lastLoginAt
                        ? new Date(record.lastLoginAt).toLocaleDateString()
                        : 'Never'}
                </Text>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: User) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenModal(record)}
                    />
                    {record.id !== currentUser?.id && (
                        <Popconfirm
                            title="Delete this user?"
                            description="This action cannot be undone."
                            onConfirm={() => handleDelete(record.id)}
                            okText="Delete"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true }}
                        >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <>
            <Head>
                <title>User Management - NQRust Analytics</title>
            </Head>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div>
                        <Title level={2}>User Management</Title>
                        <Text type="secondary">Manage user accounts and roles</Text>
                    </div>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleOpenModal()}
                    >
                        Add User
                    </Button>
                </div>

                <Card className={styles.card}>
                    <Table
                        columns={columns}
                        dataSource={users}
                        rowKey="id"
                        loading={usersLoading}
                        pagination={{ pageSize: 10 }}
                    />
                </Card>

                <Modal
                    title={editingUser ? 'Edit User' : 'Create User'}
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    footer={null}
                    width={500}
                >
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

                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleSubmit}
                    >
                        <Form.Item
                            name="displayName"
                            label="Display Name"
                            rules={[{ required: true, message: 'Please enter a display name' }]}
                        >
                            <Input prefix={<UserOutlined />} placeholder="Display name" />
                        </Form.Item>

                        {!editingUser && (
                            <>
                                <Form.Item
                                    name="email"
                                    label="Email"
                                    rules={[
                                        { required: true, message: 'Please enter an email' },
                                        { type: 'email', message: 'Please enter a valid email' },
                                    ]}
                                >
                                    <Input prefix={<MailOutlined />} placeholder="Email address" />
                                </Form.Item>

                                <Form.Item
                                    name="password"
                                    label="Password"
                                    rules={[
                                        { required: true, message: 'Please enter a password' },
                                        { min: 8, message: 'Password must be at least 8 characters' },
                                    ]}
                                >
                                    <Input.Password prefix={<LockOutlined />} placeholder="Password" />
                                </Form.Item>
                            </>
                        )}

                        <Form.Item
                            name="roleIds"
                            label="Roles"
                        >
                            <Select
                                mode="multiple"
                                placeholder="Select roles"
                                options={roles.map(r => ({ label: r.name, value: r.id }))}
                            />
                        </Form.Item>

                        {editingUser && (
                            <Form.Item
                                name="isActive"
                                label="Status"
                            >
                                <Select
                                    options={[
                                        { label: 'Active', value: true },
                                        { label: 'Inactive', value: false },
                                    ]}
                                />
                            </Form.Item>
                        )}

                        <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                            <Space>
                                <Button onClick={handleCloseModal}>
                                    Cancel
                                </Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={createLoading || updateLoading}
                                >
                                    {editingUser ? 'Update' : 'Create'}
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Modal>
            </div>
        </>
    );
}

export default function UserManagementPage() {
    return (
        <ProtectedRoute requireAdmin>
            <UserManagementContent />
        </ProtectedRoute>
    );
}
