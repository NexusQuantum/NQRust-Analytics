import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Alert } from 'antd';
import { gql, useMutation } from '@apollo/client';
import { ModalAction } from '@/hooks/useModalAction';
import { CREATE_DASHBOARD, UPDATE_DASHBOARD, LIST_DASHBOARDS } from '@/apollo/client/graphql/dashboard';

const { TextArea } = Input;

interface DashboardFormData {
    name: string;
    description?: string;
}

interface Dashboard {
    id: number;
    name: string;
    description?: string;
}

type Props = ModalAction<Dashboard | null, any>;

export default function DashboardModal({ visible, onClose, defaultValue }: Props) {
    const [form] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const isEditing = !!defaultValue?.id;

    const [createDashboard, { loading: createLoading }] = useMutation(CREATE_DASHBOARD, {
        refetchQueries: [{ query: LIST_DASHBOARDS }],
    });

    const [updateDashboard, { loading: updateLoading }] = useMutation(UPDATE_DASHBOARD, {
        refetchQueries: [{ query: LIST_DASHBOARDS }],
    });

    useEffect(() => {
        if (visible) {
            if (defaultValue) {
                form.setFieldsValue({
                    name: defaultValue.name,
                    description: defaultValue.description || '',
                });
            } else {
                form.resetFields();
            }
            setError(null);
        }
    }, [visible, defaultValue, form]);

    const handleSubmit = async (values: DashboardFormData) => {
        setError(null);

        try {
            if (isEditing) {
                await updateDashboard({
                    variables: {
                        id: defaultValue.id,
                        data: {
                            name: values.name,
                            description: values.description || null,
                        },
                    },
                });
            } else {
                await createDashboard({
                    variables: {
                        data: {
                            name: values.name,
                            description: values.description || null,
                        },
                    },
                });
            }
            onClose();
        } catch (err: any) {
            setError(err.message || `Failed to ${isEditing ? 'update' : 'create'} dashboard`);
        }
    };

    const handleClose = () => {
        setError(null);
        form.resetFields();
        onClose();
    };

    return (
        <Modal
            title={isEditing ? 'Edit Dashboard' : 'Create New Dashboard'}
            visible={visible}
            onCancel={handleClose}
            footer={null}
            width={480}
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

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{ name: '', description: '' }}
                >
                    <Form.Item
                        name="name"
                        label="Dashboard Name"
                        rules={[
                            { required: true, message: 'Please enter a dashboard name' },
                            { min: 2, message: 'Name must be at least 2 characters' },
                            { max: 100, message: 'Name must be at most 100 characters' },
                        ]}
                    >
                        <Input placeholder="e.g., Sales Overview" autoFocus />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Description"
                        rules={[
                            { max: 500, message: 'Description must be at most 500 characters' },
                        ]}
                    >
                        <TextArea
                            placeholder="Brief description of this dashboard (optional)"
                            rows={3}
                        />
                    </Form.Item>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={createLoading || updateLoading}
                            style={{ background: '#ff6b35', borderColor: '#ff6b35' }}
                        >
                            {isEditing ? 'Save Changes' : 'Create Dashboard'}
                        </Button>
                    </div>
                </Form>
            </div>
        </Modal>
    );
}
