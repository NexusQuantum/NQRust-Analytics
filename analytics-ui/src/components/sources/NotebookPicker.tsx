/**
 * Compact picker for attaching/swapping a notebook on the chat page.
 *
 * When no notebook is attached, shows an "Attach notebook" button. Clicking
 * opens a small modal listing existing notebooks (filtered to project 1
 * for the MVP) plus a quick-create input.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Empty, Input, Modal, message, Space } from 'antd';
import {
  CREATE_NOTEBOOK,
  LIST_NOTEBOOKS,
} from '@/apollo/client/graphql/notebooks';

// FIXME: project id is hardcoded to 1 for the MVP. Same scope as
// pages/notebook/index.tsx — full integration moves it to active project.
const PROJECT_ID = '2';

interface Props {
  currentNotebookId: number | null;
  onAttach: (id: number | null) => void;
}

export default function NotebookPicker({
  currentNotebookId,
  onAttach,
}: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, refetch, loading } = useQuery(LIST_NOTEBOOKS, {
    variables: { projectId: PROJECT_ID },
    skip: !open,
    fetchPolicy: 'cache-and-network',
  });
  const [createNotebook, { loading: creating }] = useMutation(CREATE_NOTEBOOK);

  const submitCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await createNotebook({
        variables: {
          input: { projectId: PROJECT_ID, name: newName.trim() },
        },
      });
      const id = res.data?.createNotebook?.id;
      if (id) {
        onAttach(id);
        setNewName('');
        setOpen(false);
      }
      await refetch();
    } catch (e: any) {
      message.error(e.message || 'Create failed');
    }
  };

  const currentName =
    (data?.notebooks || []).find((n: any) => n.id === currentNotebookId)?.name;

  return (
    <>
      <Button
        size="small"
        type={currentNotebookId ? 'default' : 'primary'}
        onClick={() => setOpen(true)}
      >
        {currentNotebookId
          ? `📔 ${currentName || `#${currentNotebookId}`}`
          : 'Attach notebook'}
      </Button>

      <Modal
        title="Attach notebook"
        visible={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <Input
            placeholder="New notebook name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={submitCreate}
          />
          <Button
            type="primary"
            onClick={submitCreate}
            loading={creating}
            disabled={!newName.trim()}
          >
            Create
          </Button>
        </div>

        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          Existing notebooks
        </div>
        {loading && !data ? (
          'Loading…'
        ) : (data?.notebooks || []).length === 0 ? (
          <Empty description="No notebooks yet" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {(data.notebooks || []).map((nb: any) => (
              <div
                key={nb.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  border:
                    nb.id === currentNotebookId
                      ? '1px solid var(--rust-orange-6)'
                      : '1px solid #eee',
                  borderRadius: 12,
                }}
              >
                <div>
                  <strong>{nb.name}</strong>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {nb.documentCount} source(s)
                  </div>
                </div>
                <Button
                  size="small"
                  type={nb.id === currentNotebookId ? 'primary' : 'default'}
                  danger={nb.id === currentNotebookId}
                  onClick={() => {
                    if (nb.id === currentNotebookId) {
                      onAttach(null);
                    } else {
                      onAttach(nb.id);
                    }
                    setOpen(false);
                  }}
                >
                  {nb.id === currentNotebookId ? 'Detach' : 'Attach'}
                </Button>
              </div>
            ))}
          </Space>
        )}

      </Modal>
    </>
  );
}
