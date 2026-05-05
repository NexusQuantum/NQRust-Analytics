import { useRouter } from 'next/router';
import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Empty, Input, Modal, Spin, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import styled from 'styled-components';

import {
  CREATE_NOTEBOOK,
  DELETE_NOTEBOOK,
  LIST_NOTEBOOKS,
} from '@/apollo/client/graphql/notebooks';

const Container = styled.div`
  max-width: 720px;
  margin: 40px auto;
  padding: 0 24px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 8px;
  background: #fff;
`;

const RowMeta = styled.div`
  flex: 1;
`;

const RowName = styled.div`
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  color: #1890ff;
  &:hover {
    text-decoration: underline;
  }
`;

const RowDesc = styled.div`
  font-size: 12px;
  color: #888;
  margin-top: 2px;
`;

const RowActions = styled.div`
  display: flex;
  gap: 12px;
`;

// FIXME: project id is hardcoded to 2 (current Northwind setup) for the MVP.
// The full integration will read it from the active project context.
const PROJECT_ID = '2';

export default function NotebookListPage() {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const { data, loading, refetch } = useQuery(LIST_NOTEBOOKS, {
    variables: { projectId: PROJECT_ID },
    fetchPolicy: 'cache-and-network',
  });
  const [createNotebook, { loading: creating }] = useMutation(CREATE_NOTEBOOK);
  const [deleteNotebook] = useMutation(DELETE_NOTEBOOK);

  const submitCreate = async () => {
    if (!name.trim()) return;
    try {
      const res = await createNotebook({
        variables: { input: { projectId: PROJECT_ID, name: name.trim() } },
      });
      setCreateOpen(false);
      setName('');
      const newId = res.data?.createNotebook?.id;
      if (newId) router.push(`/notebook/${newId}`);
    } catch (e: any) {
      message.error(e.message || 'Create failed');
    }
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Delete notebook?',
      content: 'All sources in this notebook will be removed.',
      onOk: async () => {
        try {
          await deleteNotebook({ variables: { id: String(id) } });
          await refetch();
        } catch (e: any) {
          message.error(e.message || 'Delete failed');
        }
      },
    });
  };

  const notebooks = data?.notebooks || [];

  return (
    <Container>
      <Header>
        <h1 style={{ margin: 0 }}>Notebooks</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          New notebook
        </Button>
      </Header>

      {loading && !data ? (
        <Spin />
      ) : notebooks.length === 0 ? (
        <Empty description="No notebooks yet">
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            Create your first notebook
          </Button>
        </Empty>
      ) : (
        <div>
          {notebooks.map((nb: any) => (
            <Row key={nb.id}>
              <RowMeta>
                <RowName onClick={() => router.push(`/notebook/${nb.id}`)}>
                  {nb.name}
                </RowName>
                <RowDesc>{nb.documentCount} source(s)</RowDesc>
              </RowMeta>
              <RowActions>
                <a onClick={() => router.push(`/notebook/${nb.id}`)}>Open</a>
                <a
                  style={{ color: '#ff4d4f' }}
                  onClick={() => handleDelete(nb.id)}
                >
                  Delete
                </a>
              </RowActions>
            </Row>
          ))}
        </div>
      )}

      <Modal
        title="New notebook"
        visible={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          setName('');
        }}
        onOk={submitCreate}
        confirmLoading={creating}
        okButtonProps={{ disabled: !name.trim() }}
      >
        <Input
          placeholder="e.g. Q3 strategy review"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={submitCreate}
          autoFocus
        />
      </Modal>
    </Container>
  );
}
