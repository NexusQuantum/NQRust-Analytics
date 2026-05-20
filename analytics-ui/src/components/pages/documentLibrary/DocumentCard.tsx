import React from 'react';
import styled, { css } from 'styled-components';
import { Checkbox, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FileMarkdownOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileWordOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { DocumentItem } from '@/hooks/useDocuments';
import {
  extensionOf,
  MAX_DOCUMENT_SELECTION,
} from '@/utils/documentFormats';
import { getCompactTime } from '@/utils/time';
import PdfThumbnail from './PdfThumbnail';

interface Props {
  doc: DocumentItem;
  isSelected: boolean;
  selectionDisabled: boolean;
  onToggle: (id: string) => void;
  onDelete: (doc: DocumentItem) => void;
}

const THUMB_WIDTH = 180;

const Card = styled.div<{ $selected: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--gray-1);
  border: 1px solid ${(p) => (p.$selected ? 'var(--rust-orange-5)' : 'var(--gray-3)')};
  border-radius: 10px;
  padding: 14px;
  gap: 10px;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  cursor: pointer;
  user-select: none;

  ${(p) =>
    p.$selected &&
    css`
      box-shadow: 0 0 0 2px var(--rust-orange-2);
    `}

  &:hover {
    border-color: var(--rust-orange-5);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);

    .doc-card__delete {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const ThumbWrap = styled.div`
  align-self: center;
  position: relative;
`;

const StatusOverlay = styled.div<{ $variant: 'success' | 'processing' | 'error' | 'default' }>`
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--gray-4);
  backdrop-filter: blur(2px);

  ${(p) => {
    switch (p.$variant) {
      case 'success':
        return css`
          color: var(--green-7);
          border-color: var(--green-3);
        `;
      case 'processing':
        return css`
          color: var(--blue-6);
          border-color: var(--blue-3);
        `;
      case 'error':
        return css`
          color: var(--red-6);
          border-color: var(--red-3);
        `;
      default:
        return css`
          color: var(--gray-7);
        `;
    }
  }}
`;

const TopActions = styled.div`
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  z-index: 2;

  > * {
    pointer-events: auto;
  }
`;

const CheckboxWrap = styled.div`
  /* Antd Checkbox carries its own visual; we just need a small backdrop so
     it stays visible against bright thumbnail gradients (e.g. orange PPTX
     blocks). No border — keeps it clean. */
  display: inline-flex;
  padding: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(2px);
  line-height: 0;
`;

const DeleteBtn = styled.button`
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: white;
  color: var(--red-5);
  cursor: pointer;
  opacity: 0.85;
  transform: scale(0.95);
  transition: opacity 0.15s, transform 0.15s, background 0.15s,
    box-shadow 0.15s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  font-size: 16px;

  &:hover {
    background: var(--red-1);
    color: var(--red-6);
    opacity: 1;
    transform: scale(1.05);
    box-shadow: 0 3px 10px rgba(220, 38, 38, 0.25);
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const FileName = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-9);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
`;

const Sub = styled.div`
  font-size: 11px;
  color: var(--gray-6);
  display: flex;
  align-items: center;
  gap: 6px;
`;

const NonPdfPreview = styled.div<{ $color: string }>`
  width: ${THUMB_WIDTH}px;
  height: ${Math.round(THUMB_WIDTH * (11 / 8.5))}px;
  background: ${(p) => p.$color};
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

  .anticon {
    font-size: 80px;
    color: white;
    opacity: 0.95;
  }
`;

function humanSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderPreview(doc: DocumentItem): React.ReactNode {
  const ext = extensionOf(doc.originalFilename || doc.filename || '');
  if (ext === '.pdf' && doc.status === 'indexed') {
    return <PdfThumbnail documentId={doc.id} width={THUMB_WIDTH} />;
  }
  switch (ext) {
    case '.pdf':
      return (
        <NonPdfPreview $color="linear-gradient(135deg, #f87171 0%, #b91c1c 100%)">
          <FilePdfOutlined />
        </NonPdfPreview>
      );
    case '.docx':
      return (
        <NonPdfPreview $color="linear-gradient(135deg, #60a5fa 0%, #1d4ed8 100%)">
          <FileWordOutlined />
        </NonPdfPreview>
      );
    case '.pptx':
      return (
        <NonPdfPreview $color="linear-gradient(135deg, #fb923c 0%, #c2410c 100%)">
          <FilePptOutlined />
        </NonPdfPreview>
      );
    case '.md':
    case '.markdown':
      return (
        <NonPdfPreview $color="linear-gradient(135deg, #9ca3af 0%, #4b5563 100%)">
          <FileMarkdownOutlined />
        </NonPdfPreview>
      );
    default:
      return (
        <NonPdfPreview $color="linear-gradient(135deg, #d1d5db 0%, #6b7280 100%)">
          <FileMarkdownOutlined />
        </NonPdfPreview>
      );
  }
}

function statusBadge(status: DocumentItem['status']) {
  switch (status) {
    case 'indexed':
      return (
        <StatusOverlay $variant="success">
          <CheckCircleOutlined /> Ready
        </StatusOverlay>
      );
    case 'indexing':
      return (
        <StatusOverlay $variant="processing">
          <LoadingOutlined spin /> Indexing
        </StatusOverlay>
      );
    case 'failed':
      return (
        <StatusOverlay $variant="error">
          <WarningOutlined /> Failed
        </StatusOverlay>
      );
    default:
      return (
        <StatusOverlay $variant="default">
          <ClockCircleOutlined /> Pending
        </StatusOverlay>
      );
  }
}

export default function DocumentCard({
  doc,
  isSelected,
  selectionDisabled,
  onToggle,
  onDelete,
}: Props) {
  const name = doc.originalFilename || doc.filename;
  const canSelect = doc.status === 'indexed';
  const checkboxDisabled = !canSelect || (selectionDisabled && !isSelected);

  const onCardClick = (e: React.MouseEvent) => {
    // Don't toggle if user clicked an inner button (checkbox/delete handle
    // their own clicks). Easiest check: target.closest button-like.
    if ((e.target as HTMLElement).closest('button, .ant-checkbox-wrapper, .ant-checkbox'))
      return;
    if (!checkboxDisabled) onToggle(doc.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(doc);
  };

  const tooltipContent = (
    <div>
      <div style={{ fontWeight: 500 }}>{name}</div>
      <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>
        {humanSize(doc.size)}
        {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
        {' · '}
        Added {getCompactTime(doc.createdAt)}
      </div>
      {doc.errorMessage ? (
        <div style={{ marginTop: 4, fontSize: 12, color: '#fecaca' }}>
          {doc.errorMessage}
        </div>
      ) : null}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} mouseEnterDelay={0.4} placement="top">
      <Card $selected={isSelected} onClick={onCardClick}>
        <TopActions>
          <Tooltip
            title={
              !canSelect
                ? 'Document must finish indexing before it can be selected'
                : checkboxDisabled
                  ? `Maximum ${MAX_DOCUMENT_SELECTION} documents can be selected`
                  : isSelected
                    ? 'Click to remove from chat context'
                    : 'Click to add to chat context'
            }
            placement="left"
          >
            <CheckboxWrap>
              <Checkbox
                checked={isSelected}
                disabled={checkboxDisabled}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggle(doc.id)}
              />
            </CheckboxWrap>
          </Tooltip>
          <DeleteBtn
            className="doc-card__delete"
            onClick={handleDelete}
            aria-label={`Remove ${name}`}
            title="Remove document"
          >
            <DeleteOutlined style={{ fontSize: 16 }} />
          </DeleteBtn>
        </TopActions>

        <ThumbWrap>
          {renderPreview(doc)}
          {statusBadge(doc.status)}
        </ThumbWrap>

        <Body>
          <FileName title={name}>{name}</FileName>
          <Sub>
            <span>{humanSize(doc.size)}</span>
            {doc.pageCount ? (
              <>
                <span>·</span>
                <span>{doc.pageCount} pages</span>
              </>
            ) : null}
          </Sub>
        </Body>
      </Card>
    </Tooltip>
  );
}
