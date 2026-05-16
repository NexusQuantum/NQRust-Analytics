import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Modal } from 'antd';
import { useDocuments } from '@/hooks/useDocuments';
import SourceItem from './SourceItem';
import UploadDialog from './UploadDialog';

const MAX_SELECTION = 5;
const POLL_INTERVAL_MS = 3000;

const EmptyHint = styled.div`
  padding: 8px 12px;
  font-size: 12px;
  color: var(--gray-6);
  font-style: italic;
`;

const ErrorBanner = styled.div`
  padding: 4px 12px;
  font-size: 11px;
  color: var(--red-6);
  background: var(--red-1);
  border-radius: 4px;
  margin: 0 8px 4px;
`;

interface Props {
  /** called so parent can render the Upload button in the section header */
  onUploadClick?: () => void;
  /** set by parent to drive the upload dialog open/close */
  uploadOpen?: boolean;
  onUploadClose?: () => void;
}

export default function SourcesPanel({ uploadOpen = false, onUploadClose }: Props) {
  const { documents, selectedIds, loading, error, refetch, uploadDocuments, deleteDocument, toggleSelection } =
    useDocuments();

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasIndexing = documents.some((d) => d.status === 'indexing' || d.status === 'pending');

  useEffect(() => {
    if (hasIndexing) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => { refetch(); }, POLL_INTERVAL_MS);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasIndexing, refetch]);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: 'Remove Document',
      content: 'This will remove the document and its index. Are you sure?',
      okText: 'Remove',
      okButtonProps: { danger: true },
      onOk: () => deleteDocument(id),
    });
  };

  const selectionCount = selectedIds.length;

  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {documents.length === 0 && !loading && (
        <EmptyHint>No documents yet. Upload a PDF to get started.</EmptyHint>
      )}

      {documents.map((doc) => (
        <SourceItem
          key={doc.id}
          document={doc}
          isSelected={selectedIds.includes(doc.id)}
          selectionDisabled={selectionCount >= MAX_SELECTION && !selectedIds.includes(doc.id)}
          onToggle={toggleSelection}
          onDelete={handleDelete}
        />
      ))}

      {selectionCount > 0 && (
        <EmptyHint style={{ fontStyle: 'normal', color: 'var(--gray-7)', marginTop: 4 }}>
          <span style={{ color: 'var(--gray-6)' }}>{selectionCount}/{MAX_SELECTION}</span> selected for context
        </EmptyHint>
      )}

      <UploadDialog
        visible={uploadOpen}
        uploading={loading}
        onClose={onUploadClose || (() => {})}
        onUpload={uploadDocuments}
      />
    </>
  );
}
