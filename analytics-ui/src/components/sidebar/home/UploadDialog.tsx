import React, { useCallback, useState } from 'react';
import { Modal, Alert } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import styled from 'styled-components';

interface Props {
  visible: boolean;
  uploading: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}

const DropZone = styled.div<{ $active: boolean }>`
  border: 2px dashed ${(p) => (p.$active ? 'var(--blue-5)' : 'var(--gray-4)')};
  border-radius: 8px;
  padding: 32px 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  background-color: ${(p) => (p.$active ? 'var(--blue-1)' : 'var(--gray-1)')};

  &:hover {
    border-color: var(--blue-4);
    background-color: var(--blue-1);
  }
`;

const DropIcon = styled(InboxOutlined)`
  font-size: 40px;
  color: var(--blue-5);
  display: block;
  margin-bottom: 8px;
`;

const DropText = styled.p`
  margin: 0 0 4px;
  font-size: 14px;
  color: var(--gray-8);
`;

const DropHint = styled.p`
  margin: 0;
  font-size: 12px;
  color: var(--gray-6);
`;

const HiddenInput = styled.input`
  display: none;
`;

const MAX_SIZE_MB = 20;
const ACCEPTED_MIME = 'application/pdf';

export default function UploadDialog({ visible, uploading, onClose, onUpload }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const validate = (file: File): string | null => {
    if (file.type !== ACCEPTED_MIME) return 'Only PDF files are supported.';
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return `File must be smaller than ${MAX_SIZE_MB} MB.`;
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        setLocalError(err);
        return;
      }
      setLocalError(null);
      try {
        await onUpload(file);
        onClose();
      } catch (e: any) {
        setLocalError(e.message || 'Upload failed');
      }
    },
    [onUpload, onClose],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleClose = () => {
    if (uploading) return;
    setLocalError(null);
    onClose();
  };

  return (
    <Modal
      title="Upload Document"
      visible={visible}
      onCancel={handleClose}
      footer={null}
      maskClosable={!uploading}
      width={480}
      destroyOnClose
    >
      {localError && (
        <Alert
          type="error"
          message={localError}
          closable
          onClose={() => setLocalError(null)}
          style={{ marginBottom: 12 }}
        />
      )}

      <DropZone
        $active={dragActive}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <DropIcon />
        <DropText>
          {uploading ? 'Uploading…' : 'Click or drag a PDF here to upload'}
        </DropText>
        <DropHint>PDF only · max {MAX_SIZE_MB} MB · max 100 pages</DropHint>
      </DropZone>

      <HiddenInput
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleChange}
      />
    </Modal>
  );
}
