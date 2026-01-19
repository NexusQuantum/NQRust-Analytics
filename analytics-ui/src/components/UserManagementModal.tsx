import React, { useState } from 'react';
import { Modal, Table, Button, Space, Tag, message, Popconfirm, Form, Input, Select } from 'antd';
import {
    UserOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import { gql, useQuery, useMutation } from '@apollo/client';
import { ModalAction } from '@/hooks/useModalAction';

const StyledModal = styled(Modal)`
  .ant-modal-content {
    overflow: hidden;
  }
`;

const USERS_QUERY = gql`
  query Users {
    users {
      id
      email
      displayName
      isActive
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
      email
      displayName
      isActive
    }
  }
`;

const DELETE_USER_MUTATION = gql`
  mutation DeleteUser($where: UserWhereInput!) {
    deleteUser(where: $where)
  }
`;

type Props = ModalAction<any, any>;

interface User {
    id: number;
    email: string;
    displayName: string;
    isActive: boolean;
    roles: { id: number; name: string }[];
}

export default function UserManagementModal({ visible, onClose }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [form] = Form.useForm();

    const { data: usersData, loading: usersLoading, refetch } = useQuery(USERS_QUERY, {
        skip: !visible,
        fetchPolicy: 'cache-and-network',
    });

    const { data: rolesData } = useQuery(ROLES_QUERY, {
        skip: !visible,
    });

    const [createUser, { loading: creating }] = useMutation(CREATE_USER_MUTATION, {
        onCompleted: () => {
            message.success('User created successfully');
            refetch();
            setIsEditing(false);
            form.resetFields();
        },
        onError: (err) => message.error(err.message),
    });

    const [updateUser, { loading: updating }] = useMutation(UPDATE_USER_MUTATION, {
        onCompleted: () => {
            message.success('User updated successfully');
            refetch();
            setIsEditing(false);
            setEditingUser(null);
            form.resetFields();
        },
        onError: (err) => message.error(err.message),
    });

    const [deleteUser] = useMutation(DELETE_USER_MUTATION, {
        onCompleted: () => {
            message.success('User deleted successfully');
            refetch();
        },
        onError: (err) => message.error(err.message),
    });

    const handleClose = () => {
        setIsEditing(false);
        setEditingUser(null);
        form.resetFields();
        onClose();
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setIsEditing(true);
        form.setFieldsValue({
            displayName: user.displayName,
            email: user.email,
            roleIds: user.roles.map(r => r.id),
            isActive: user.isActive,
        });
    };

    const handleCreate = () => {
        setEditingUser(null);
        setIsEditing(true);
        form.resetFields();
    };

    const handleSubmit = async (values: any) => {
        if (editingUser) {
            await updateUser({
                variables: {
                    where: { id: editingUser.id },
                    data: {
                        displayName: values.displayName,
                        roleIds: values.roleIds,
                        isActive: values.isActive,
                    },
                },
            });
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
        }
    };

    const handleDelete = async (id: number) => {
        await deleteUser({ variables: { where: { id } } });
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'displayName',
            key: 'displayName',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Roles',
            dataIndex: 'roles',
            key: 'roles',
            render: (roles: { name: string }[]) => (
                <Space size={4}>
                    {roles.map(role => (
                        <Tag key={role.name} color={role.name === 'admin' ? 'orange' : 'default'}>
                            {role.name}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) => (
                <Tag color={isActive ? 'green' : 'red'}>
                    {isActive ? 'Active' : 'Inactive'}
                </Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_: any, record: User) => (
                <Space size={8}>
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                    <Popconfirm
                        title="Delete this user?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <StyledModal
            title={isEditing ? (editingUser ? 'Edit User' : 'Create User') : 'User Management'}
            visible={visible}
            onCancel={isEditing ? () => { setIsEditing(false); setEditingUser(null); form.resetFields(); } : handleClose}
            footer={null}
            width={isEditing ? 450 : 700}
            destroyOnClose
        >
            {!isEditing ? (
                <>
                    <div style={{ marginBottom: 16, textAlign: 'right' }}>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreate}
                            style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                        >
                            Add User
                        </Button>
                    </div>
                    <Table
                        dataSource={usersData?.users || []}
                        columns={columns}
                        rowKey="id"
                        loading={usersLoading}
                        pagination={{ pageSize: 5 }}
                        size="small"
                    />
                </>
            ) : (
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    style={{ padding: '16px 0' }}
                >
                    {!editingUser && (
                        <Form.Item
                            name="email"
                            label="Email"
                            rules={[
                                { required: true, message: 'Please enter email' },
                                { type: 'email', message: 'Please enter a valid email' },
                            ]}
                        >
                            <Input prefix={<UserOutlined />} placeholder="Email address" />
                        </Form.Item>
                    )}

                    <Form.Item
                        name="displayName"
                        label="Display Name"
                        rules={[{ required: true, message: 'Please enter display name' }]}
                    >
                        <Input placeholder="Display name" />
                    </Form.Item>

                    {!editingUser && (
                        <Form.Item
                            name="password"
                            label="Password"
                            rules={[
                                { required: true, message: 'Please enter password' },
                                { min: 8, message: 'Password must be at least 8 characters' },
                            ]}
                        >
                            <Input.Password placeholder="Password" />
                        </Form.Item>
                    )}

                    <Form.Item
                        name="roleIds"
                        label="Roles"
                    >
                        <Select
                            mode="multiple"
                            placeholder="Select roles"
                            options={rolesData?.roles?.map((role: any) => ({
                                label: role.name,
                                value: role.id,
                            })) || []}
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
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={creating || updating}
                                style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                            >
                                {editingUser ? 'Update User' : 'Create User'}
                            </Button>
                            <Button onClick={() => { setIsEditing(false); setEditingUser(null); form.resetFields(); }}>
                                Cancel
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            )}
        </StyledModal>
    );
}
