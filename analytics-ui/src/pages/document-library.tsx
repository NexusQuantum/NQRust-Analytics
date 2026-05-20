import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Empty,
  Modal as AntModal,
  Skeleton,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, InboxOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import SiderLayout from '@/components/layouts/SiderLayout';
import PageLayout from '@/components/layouts/PageLayout';
import UploadDialog from '@/components/sidebar/home/UploadDialog';
import DocumentCard from '@/components/pages/documentLibrary/DocumentCard';
import { useDocuments, DocumentItem } from '@/hooks/useDocuments';
import { MAX_DOCUMENT_SELECTION } from '@/utils/documentFormats';

const { Text } = Typography;

const POLL_INTERVAL_MS = 3000;

const SelectionBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--gray-2);
  border: 1px solid var(--gray-4);
  border-radius: 6px;
  font-size: 12px;
  color: var(--gray-8);
  margin-right: 12px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  align-items: stretch;
`;

const SkeletonCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--gray-3);
  border-radius: 10px;
  background: var(--gray-1);
`;

const SkeletonThumb = styled.div`
  align-self: center;
  width: 180px;
  height: ${Math.round(180 * (11 / 8.5))}px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--gray-2) 0%,
    var(--gray-3) 50%,
    var(--gray-2) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const EmptyState = styled.div`
  padding: 64px 24px;
  border: 1px dashed var(--gray-4);
  border-radius: 12px;
  background: var(--gray-1);
  text-align: center;
`;

export default function DocumentLibraryPage() {
  const {
    documents,
    selectedIds,
    loading,
    error,
    refetch,
    uploadDocuments,
    deleteDocument,
    toggleSelection,
  } = useDocuments();

  const [uploadOpen, setUploadOpen] = useState(false);

  // Poll while any document is still being indexed.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasIndexing = documents.some(
    (d) => d.status === 'indexing' || d.status === 'pending',
  );

  useEffect(() => {
    if (hasIndexing) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          refetch();
        }, POLL_INTERVAL_MS);
      }
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasIndexing, refetch]);

  const handleDelete = (doc: DocumentItem) => {
    AntModal.confirm({
      title: 'Remove document',
      content: (
        <>
          Remove <Text strong>{doc.originalFilename || doc.filename}</Text> and
          its index? This cannot be undone.
        </>
      ),
      okText: 'Remove',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDocument(doc.id);
          message.success('Document removed');
        } catch (e: any) {
          message.error(e?.message || 'Failed to remove document');
        }
      },
    });
  };

  const selectionCount = selectedIds.length;
  const selectionAtMax = selectionCount >= MAX_DOCUMENT_SELECTION;
  const initialLoading = loading && documents.length === 0;

  return (
    <SiderLayout loading={false}>
      <PageLayout
        title="Document Library"
        titleExtra={
          <div className="d-flex align-center">
            <SelectionBadge>
              <span>
                <strong>{selectionCount}</strong>/{MAX_DOCUMENT_SELECTION}
              </span>
              <span style={{ color: 'var(--gray-6)' }}>selected for chat</span>
            </SelectionBadge>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              Upload documents
            </Button>
          </div>
        }
        description={
          <>
            Manage documents used as a knowledge base for chat. Upload PDFs,
            Markdown, Word (.docx), or PowerPoint (.pptx) files; pick up to{' '}
            {MAX_DOCUMENT_SELECTION} to include as context in new chat turns. Selection
            is global — every chat thread sees the same set.{' '}
            <Link
              className="gray-8 underline"
              href="https://docs.getanalytics.ai/oss/guide/knowledge/documents"
              rel="noopener noreferrer"
              target="_blank"
            >
              Learn more.
            </Link>
          </>
        }
      >
        {error && (
          <Alert
            type="error"
            message={error}
            closable
            style={{ marginBottom: 12 }}
          />
        )}

        {initialLoading ? (
          <Grid>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i}>
                <SkeletonThumb />
                <Skeleton active title={false} paragraph={{ rows: 2, width: ['80%', '40%'] }} />
              </SkeletonCard>
            ))}
          </Grid>
        ) : documents.length === 0 ? (
          <EmptyState>
            <Empty
              image={
                <InboxOutlined
                  style={{ fontSize: 64, color: 'var(--gray-5)' }}
                />
              }
              imageStyle={{ height: 80 }}
              description={
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      color: 'var(--gray-8)',
                      marginBottom: 4,
                    }}
                  >
                    No documents yet
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray-6)' }}>
                    Upload PDFs, Markdown, Word, or PowerPoint files to start
                    building your knowledge base.
                  </div>
                </div>
              }
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setUploadOpen(true)}
              >
                Upload your first document
              </Button>
            </Empty>
          </EmptyState>
        ) : (
          <Grid>
            {documents.map((doc) => {
              const isSelected = selectedIds.includes(doc.id);
              return (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  isSelected={isSelected}
                  selectionDisabled={selectionAtMax}
                  onToggle={toggleSelection}
                  onDelete={handleDelete}
                />
              );
            })}
          </Grid>
        )}

        <UploadDialog
          visible={uploadOpen}
          uploading={loading}
          onClose={() => setUploadOpen(false)}
          onUpload={uploadDocuments}
        />
      </PageLayout>
    </SiderLayout>
  );
}
