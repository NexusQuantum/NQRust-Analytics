import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Checkbox,
  Modal as AntModal,
  Table,
  TableColumnsType,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  LoadingOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import SiderLayout from '@/components/layouts/SiderLayout';
import PageLayout from '@/components/layouts/PageLayout';
import UploadDialog from '@/components/sidebar/home/UploadDialog';
import { useDocuments, DocumentItem } from '@/hooks/useDocuments';
import { getCompactTime } from '@/utils/time';

const { Text } = Typography;

const MAX_SELECTION = 5;
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

const FileNameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const FileNameText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

function fileTypeIcon(filename: string, mimeType: string): React.ReactNode {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    return <FilePdfOutlined style={{ color: 'var(--red-5)', fontSize: 16 }} />;
  }
  if (lower.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
    return <FileWordOutlined style={{ color: 'var(--blue-6)', fontSize: 16 }} />;
  }
  if (lower.endsWith('.pptx') || mimeType.includes('presentationml')) {
    return <FilePptOutlined style={{ color: 'var(--orange-6)', fontSize: 16 }} />;
  }
  if (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    mimeType.includes('markdown')
  ) {
    return <FileMarkdownOutlined style={{ color: 'var(--gray-7)', fontSize: 16 }} />;
  }
  return <FileTextOutlined style={{ color: 'var(--gray-6)', fontSize: 16 }} />;
}

function statusTag(status: DocumentItem['status']) {
  switch (status) {
    case 'indexed':
      return (
        <Tag icon={<CheckCircleOutlined />} color="success">
          Ready
        </Tag>
      );
    case 'indexing':
      return (
        <Tag icon={<LoadingOutlined spin />} color="processing">
          Indexing
        </Tag>
      );
    case 'failed':
      return (
        <Tag icon={<WarningOutlined />} color="error">
          Failed
        </Tag>
      );
    default:
      return (
        <Tag icon={<ClockCircleOutlined />} color="default">
          Pending
        </Tag>
      );
  }
}

function humanSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  const columns: TableColumnsType<DocumentItem> = [
    {
      title: 'Use as context',
      key: 'selection',
      width: 130,
      align: 'center',
      render: (_, doc) => {
        const isSelected = selectedIds.includes(doc.id);
        const disabled =
          doc.status !== 'indexed' ||
          (!isSelected && selectionCount >= MAX_SELECTION);
        const reason =
          doc.status !== 'indexed'
            ? 'Document must finish indexing before it can be selected'
            : !isSelected && selectionCount >= MAX_SELECTION
              ? `Maximum ${MAX_SELECTION} documents can be selected`
              : undefined;
        return (
          <Tooltip title={reason}>
            <Checkbox
              checked={isSelected}
              disabled={disabled}
              onChange={() => toggleSelection(doc.id)}
            />
          </Tooltip>
        );
      },
    },
    {
      title: 'File',
      dataIndex: 'originalFilename',
      render: (_, doc) => {
        const name = doc.originalFilename || doc.filename;
        return (
          <FileNameCell>
            {fileTypeIcon(name, doc.mimeType)}
            <Tooltip title={name}>
              <FileNameText>{name}</FileNameText>
            </Tooltip>
          </FileNameCell>
        );
      },
    },
    {
      title: 'Size',
      dataIndex: 'size',
      width: 100,
      render: (size: number) => (
        <Text className="gray-7">{humanSize(size)}</Text>
      ),
    },
    {
      title: 'Pages',
      dataIndex: 'pageCount',
      width: 80,
      align: 'center',
      render: (pageCount: number | null) => (
        <Text className="gray-7">{pageCount ? pageCount : '—'}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 140,
      render: (status: DocumentItem['status'], doc) => (
        <Tooltip title={doc.errorMessage || undefined}>
          {statusTag(status)}
        </Tooltip>
      ),
    },
    {
      title: 'Added',
      dataIndex: 'createdAt',
      width: 130,
      render: (time: string) => (
        <Text className="gray-7">{getCompactTime(time)}</Text>
      ),
    },
    {
      key: 'action',
      width: 56,
      align: 'center',
      fixed: 'right',
      render: (_, doc) => (
        <Tooltip title="Remove document">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(doc)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <SiderLayout loading={false}>
      <PageLayout
        title="Document Library"
        titleExtra={
          <div className="d-flex align-center">
            <SelectionBadge>
              <span>
                <strong>{selectionCount}</strong>/{MAX_SELECTION}
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
            {MAX_SELECTION} to include as context in new chat turns. Selection
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
        <Table
          className="ant-table-has-header"
          dataSource={documents}
          loading={loading && documents.length === 0}
          columns={columns}
          rowKey="id"
          pagination={{
            hideOnSinglePage: true,
            pageSize: 20,
            size: 'small',
          }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: loading
              ? 'Loading…'
              : 'No documents yet. Click "Upload documents" to add one.',
          }}
        />

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
