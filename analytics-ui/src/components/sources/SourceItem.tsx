import React from 'react';
import { Checkbox, Tooltip, Spin } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DeleteOutlined,
  FileTextOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';

export interface SourceItemDoc {
  id: number;
  filename: string;
  status: 'uploading' | 'parsing' | 'embedding' | 'ready' | 'failed' | string;
  errorMessage?: string | null;
  selected: boolean;
}

interface Props {
  doc: SourceItemDoc;
  onToggle: (id: number, next: boolean) => void;
  onDelete: (id: number) => void;
  /** Disable the checkbox (e.g. while loading or doc not yet ready). */
  disabled?: boolean;
}

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 4px;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
`;

const Filename = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
`;

const StatusIcon = styled.span`
  width: 16px;
  text-align: center;
  font-size: 14px;
`;

function renderStatus(doc: SourceItemDoc) {
  switch (doc.status) {
    case 'ready':
      return (
        <Tooltip title="Ready">
          <CheckCircleFilled style={{ color: '#52c41a' }} />
        </Tooltip>
      );
    case 'failed':
      return (
        <Tooltip title={doc.errorMessage || 'Indexing failed'}>
          <CloseCircleFilled style={{ color: '#ff4d4f' }} />
        </Tooltip>
      );
    case 'uploading':
    case 'parsing':
    case 'embedding':
      return (
        <Tooltip title={`Status: ${doc.status}`}>
          <Spin indicator={<LoadingOutlined spin style={{ fontSize: 14 }} />} />
        </Tooltip>
      );
    default:
      return <FileTextOutlined />;
  }
}

export default function SourceItem({ doc, onToggle, onDelete, disabled }: Props) {
  const ready = doc.status === 'ready';
  return (
    <Row>
      <Checkbox
        checked={doc.selected}
        disabled={disabled || !ready}
        onChange={(e) => onToggle(doc.id, e.target.checked)}
      />
      <StatusIcon>{renderStatus(doc)}</StatusIcon>
      <Tooltip title={doc.filename} mouseEnterDelay={0.5}>
        <Filename>{doc.filename}</Filename>
      </Tooltip>
      <Tooltip title="Delete">
        <DeleteOutlined
          onClick={() => onDelete(doc.id)}
          style={{ cursor: 'pointer', color: '#999' }}
        />
      </Tooltip>
    </Row>
  );
}
