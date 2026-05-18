import React from 'react';
import styled from 'styled-components';
import { Checkbox, Tooltip } from 'antd';
import {
  LoadingOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FilePptOutlined,
  FileMarkdownOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { DocumentItem } from '@/hooks/useDocuments';

interface Props {
  document: DocumentItem;
  isSelected: boolean;
  selectionDisabled: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: default;

  &:hover {
    background-color: var(--gray-2);

    .delete-btn {
      opacity: 1;
    }
  }
`;

const StyledCheckbox = styled(Checkbox)`
  flex-shrink: 0;
`;

const FileInfo = styled.div`
  flex: 1 1 0;
  min-width: 0;
`;

const FileName = styled.div`
  font-size: 12px;
  color: var(--gray-9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusLine = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--gray-6);
  margin-top: 1px;
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--gray-5);
  padding: 2px 4px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  display: flex;
  align-items: center;

  &:hover {
    color: var(--red-5);
  }
`;

function FileTypeIcon({ filename, mimeType }: { filename: string; mimeType: string }) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    return <FilePdfOutlined style={{ color: 'var(--red-5)', fontSize: 13 }} />;
  }
  if (lower.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
    return <FileWordOutlined style={{ color: 'var(--blue-6)', fontSize: 13 }} />;
  }
  if (lower.endsWith('.pptx') || mimeType.includes('presentationml')) {
    return <FilePptOutlined style={{ color: 'var(--orange-6)', fontSize: 13 }} />;
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || mimeType.includes('markdown')) {
    return <FileMarkdownOutlined style={{ color: 'var(--gray-7)', fontSize: 13 }} />;
  }
  return <FileTextOutlined style={{ color: 'var(--gray-6)', fontSize: 13 }} />;
}

function StatusBadge({ status }: { status: DocumentItem['status'] }) {
  switch (status) {
    case 'indexing':
      return (
        <>
          <LoadingOutlined style={{ color: 'var(--blue-5)', fontSize: 11 }} spin />
          <span>Indexing…</span>
        </>
      );
    case 'indexed':
      return (
        <>
          <CheckCircleOutlined style={{ color: 'var(--green-6)', fontSize: 11 }} />
          <span style={{ color: 'var(--green-7)' }}>Ready</span>
        </>
      );
    case 'failed':
      return (
        <>
          <WarningOutlined style={{ color: 'var(--red-5)', fontSize: 11 }} />
          <span style={{ color: 'var(--red-5)' }}>Failed</span>
        </>
      );
    default:
      return (
        <>
          <ClockCircleOutlined style={{ color: 'var(--gray-5)', fontSize: 11 }} />
          <span>Pending</span>
        </>
      );
  }
}

export default function SourceItem({ document, isSelected, selectionDisabled, onToggle, onDelete }: Props) {
  const checkboxDisabled = !isSelected && selectionDisabled;
  const canSelect = document.status === 'indexed';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(document.id);
  };

  const label = document.originalFilename || document.filename;

  return (
    <Row>
      <Tooltip
        title={
          !canSelect
            ? 'Document must finish indexing before it can be selected'
            : checkboxDisabled
              ? 'Maximum 5 documents can be selected'
              : undefined
        }
      >
        <StyledCheckbox
          checked={isSelected}
          disabled={!canSelect || checkboxDisabled}
          onChange={() => onToggle(document.id)}
        />
      </Tooltip>

      <FileTypeIcon filename={document.originalFilename || document.filename} mimeType={document.mimeType} />

      <FileInfo>
        <Tooltip title={label} placement="right">
          <FileName>{label}</FileName>
        </Tooltip>
        <StatusLine>
          <StatusBadge status={document.status} />
          {/* pageCount is 0/null for markdown-derived docs (mammoth/pptx route)
              — only show it when the document actually has pages (PDFs). */}
          {document.pageCount ? (
            <span>· {document.pageCount}p</span>
          ) : null}
        </StatusLine>
      </FileInfo>

      <Tooltip title="Delete document">
        <DeleteButton className="delete-btn" onClick={handleDelete}>
          <DeleteOutlined style={{ fontSize: 12 }} />
        </DeleteButton>
      </Tooltip>
    </Row>
  );
}
