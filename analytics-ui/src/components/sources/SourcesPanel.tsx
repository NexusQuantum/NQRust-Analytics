import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Empty, Tooltip, message } from 'antd';
import {
  PlusOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';

import {
  LIST_DOCUMENTS,
  TOGGLE_DOCUMENT_SELECTION,
  DELETE_DOCUMENT,
} from '@/apollo/client/graphql/notebooks';
import SourceItem, { SourceItemDoc } from './SourceItem';
import UploadDialog from './UploadDialog';
import NotebookPicker from './NotebookPicker';
import { useNotebookContext } from '@/hooks/useNotebookContext';

const Panel = styled.div<{ $collapsed: boolean }>`
  width: ${(p) => (p.$collapsed ? '40px' : '260px')};
  border-right: 1px solid #eee;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  /* Sticky to viewport top so it doesn't scroll with chat content.
     Caller wrapper provides height; we fill it but stay pinned. */
  position: sticky;
  top: 0;
  height: 100vh;
  align-self: flex-start;
  transition: width 0.15s ease;
  flex-shrink: 0;
  z-index: 10;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid #eee;
`;

const Title = styled.div`
  font-weight: 600;
  font-size: 13px;
`;

const ListBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
`;

const Footer = styled.div`
  padding: 8px;
  border-top: 1px solid #eee;
  font-size: 11px;
  color: #999;
`;

interface Props {
  notebookId: number | null;
  /** Number currently selected — also surfaced via prop so the chat can show "X docs active". */
  onSelectionChange?: (selectedIds: number[]) => void;
}

const MAX_SELECTED = 10;

export default function SourcesPanel({
  notebookId,
  onSelectionChange,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, loading, refetch } = useQuery(LIST_DOCUMENTS, {
    variables: { notebookId: String(notebookId) },
    skip: !notebookId,
    fetchPolicy: 'cache-and-network',
  });

  const docs: SourceItemDoc[] = data?.documents || [];

  // Poll while there are documents in flight (parsing/embedding).
  const inFlight = useMemo(
    () =>
      docs.some((d) =>
        ['uploading', 'parsing', 'embedding'].includes(d.status),
      ),
    [docs],
  );
  useEffect(() => {
    if (!inFlight || !notebookId) return undefined;
    const t = setInterval(() => refetch(), 3000);
    return () => clearInterval(t);
  }, [inFlight, notebookId, refetch]);

  // Notify parent on selection changes.
  useEffect(() => {
    onSelectionChange?.(docs.filter((d) => d.selected).map((d) => d.id));
  }, [docs, onSelectionChange]);

  const [toggleSelection] = useMutation(TOGGLE_DOCUMENT_SELECTION, {
    refetchQueries: [
      { query: LIST_DOCUMENTS, variables: { notebookId: String(notebookId) } },
    ],
  });
  const [deleteDocument] = useMutation(DELETE_DOCUMENT, {
    refetchQueries: [
      { query: LIST_DOCUMENTS, variables: { notebookId: String(notebookId) } },
    ],
  });

  const handleToggle = async (id: number, next: boolean) => {
    if (next) {
      const currentSelected = docs.filter((d) => d.selected).length;
      if (currentSelected >= MAX_SELECTED) {
        message.warning(`Maximum ${MAX_SELECTED} sources can be active at once`);
        return;
      }
    }
    try {
      await toggleSelection({
        variables: { documentId: String(id), selected: next },
      });
    } catch (e: any) {
      message.error(e.message || 'Failed to toggle selection');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDocument({ variables: { id: String(id) } });
      message.success('Source deleted');
    } catch (e: any) {
      message.error(e.message || 'Failed to delete');
    }
  };

  const { setNotebookId } = useNotebookContext();

  if (!notebookId) {
    return (
      <Panel $collapsed={false}>
        <Header>
          <Title>Sources</Title>
        </Header>
        <ListBody>
          <Empty description="No notebook attached to this chat">
            <NotebookPicker
              currentNotebookId={null}
              onAttach={(id) => setNotebookId(id)}
            />
          </Empty>
        </ListBody>
      </Panel>
    );
  }

  return (
    <Panel $collapsed={collapsed}>
      <Header>
        {!collapsed && <Title>Sources</Title>}
        <div style={{ display: 'flex', gap: 4 }}>
          {!collapsed && (
            <Tooltip title="Upload">
              <Button
                size="small"
                type="text"
                icon={<PlusOutlined />}
                onClick={() => setUploadOpen(true)}
              />
            </Tooltip>
          )}
          <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
            <Button
              size="small"
              type="text"
              icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
          </Tooltip>
        </div>
      </Header>

      {!collapsed && (
        <div
          style={{
            padding: '6px 8px',
            borderBottom: '1px solid #eee',
            fontSize: 12,
          }}
        >
          <NotebookPicker
            currentNotebookId={notebookId}
            onAttach={(id) => setNotebookId(id)}
          />
        </div>
      )}

      {!collapsed && (
        <>
          <ListBody>
            {loading && docs.length === 0 ? (
              <div style={{ padding: 16, color: '#888', fontSize: 13 }}>
                Loading…
              </div>
            ) : docs.length === 0 ? (
              <Empty description="No sources yet">
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setUploadOpen(true)}
                >
                  Add source
                </Button>
              </Empty>
            ) : (
              docs.map((d) => (
                <SourceItem
                  key={d.id}
                  doc={d}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))
            )}
          </ListBody>
          <Footer>
            {docs.filter((d) => d.selected).length} / {MAX_SELECTED} active
          </Footer>
        </>
      )}

      <UploadDialog
        open={uploadOpen}
        notebookId={notebookId}
        onClose={() => setUploadOpen(false)}
        onCompleted={refetch}
      />
    </Panel>
  );
}
