import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Button, Empty, Tooltip, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  background: #fafafa;
  width: 100%;
  border-top: 1px solid #eee;
  max-height: 320px;
  flex-shrink: 0;
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
  flex: 1 1 auto;
  min-height: 0;
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

  // Notify parent on selection changes only when the selected-id set actually
  // changes, not on every poll-driven refetch of the docs list.
  const selectedIdsKey = useMemo(
    () =>
      docs
        .filter((d) => d.selected)
        .map((d) => d.id)
        .sort((a, b) => a - b)
        .join(','),
    [docs],
  );
  const lastNotifiedKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastNotifiedKey.current === selectedIdsKey) return;
    lastNotifiedKey.current = selectedIdsKey;
    onSelectionChange?.(
      selectedIdsKey ? selectedIdsKey.split(',').map(Number) : [],
    );
  }, [selectedIdsKey, onSelectionChange]);

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
      <Panel>
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
    <Panel>
      <Header>
        <Title>Sources</Title>
        <Tooltip title="Upload">
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setUploadOpen(true)}
          />
        </Tooltip>
      </Header>

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

      <UploadDialog
        open={uploadOpen}
        notebookId={notebookId}
        onClose={() => setUploadOpen(false)}
        onCompleted={refetch}
      />
    </Panel>
  );
}
