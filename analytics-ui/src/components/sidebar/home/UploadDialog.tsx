import React, { useCallback, useState } from 'react';
import { Modal, Alert, Button } from 'antd';
import {
  InboxOutlined,
  FileTextOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';

interface Props {
  visible: boolean;
  uploading: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => Promise<{ file: string; error: string }[]>;
}

interface StagedFile {
  file: File;
  validationError?: string;
  uploadError?: string;
}

const DropZone = styled.div<{ $active: boolean }>`
  border: 2px dashed ${(p) => (p.$active ? 'var(--blue-5)' : 'var(--gray-4)')};
  border-radius: 8px;
  padding: 24px 16px;
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
  font-size: 36px;
  color: var(--blue-5);
  display: block;
  margin-bottom: 6px;
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

const FileList = styled.div`
  margin-top: 12px;
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--gray-3);
  border-radius: 6px;
`;

const FileRow = styled.div<{ $hasError: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gray-3);
  background: ${(p) => (p.$hasError ? 'var(--red-1)' : 'transparent')};

  &:last-child {
    border-bottom: none;
  }
`;

const FileMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileName = styled.div`
  font-size: 13px;
  color: var(--gray-8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FileSubline = styled.div`
  font-size: 11px;
  color: var(--gray-6);
`;

const FileError = styled.div`
  font-size: 11px;
  color: var(--red-6);
  margin-top: 2px;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
`;

const MAX_SIZE_MB = 20;
const ACCEPTED_MIME = 'application/pdf';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validate(file: File): string | undefined {
  if (
    file.type !== ACCEPTED_MIME &&
    !file.name.toLowerCase().endsWith('.pdf')
  ) {
    return 'Only PDF files are supported.';
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `Must be smaller than ${MAX_SIZE_MB} MB.`;
  }
  return undefined;
}

export default function UploadDialog({
  visible,
  uploading,
  onClose,
  onUpload,
}: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      setStaged((prev) => {
        const existing = new Set(prev.map((s) => `${s.file.name}:${s.file.size}`));
        const additions: StagedFile[] = [];
        for (const file of arr) {
          const key = `${file.name}:${file.size}`;
          if (existing.has(key)) continue;
          existing.add(key);
          additions.push({ file, validationError: validate(file) });
        }
        return [...prev, ...additions];
      });
      setLocalError(null);
    },
    [],
  );

  const removeAt = (idx: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleClose = () => {
    if (uploading) return;
    setStaged([]);
    setLocalError(null);
    onClose();
  };

  const handleUpload = async () => {
    const valid = staged.filter((s) => !s.validationError);
    if (valid.length === 0) {
      setLocalError('No valid files to upload.');
      return;
    }
    setLocalError(null);
    try {
      const failures = await onUpload(valid.map((s) => s.file));
      if (failures.length === 0) {
        setStaged([]);
        onClose();
        return;
      }
      // Partial success: keep only the failed ones in the dialog,
      // annotated with the per-file error, plus any pre-existing
      // validation failures that were never sent.
      const failureMap = new Map(failures.map((f) => [f.file, f.error]));
      setStaged((prev) =>
        prev
          .filter(
            (s) => s.validationError || failureMap.has(s.file.name),
          )
          .map((s) => ({
            ...s,
            uploadError: failureMap.get(s.file.name),
          })),
      );
      setLocalError(
        `${failures.length} of ${valid.length} file(s) failed to upload. ` +
          `Fix or remove them and retry.`,
      );
    } catch (e: any) {
      setLocalError(e?.message || 'Upload failed');
    }
  };

  const validCount = staged.filter((s) => !s.validationError).length;
  const uploadLabel =
    validCount > 1 ? `Upload ${validCount} files` : 'Upload';

  return (
    <Modal
      title="Upload Documents"
      visible={visible}
      onCancel={handleClose}
      footer={null}
      maskClosable={!uploading}
      width={520}
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
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <DropIcon />
        <DropText>
          {uploading
            ? 'Uploading…'
            : 'Click or drag PDF files here (multiple allowed)'}
        </DropText>
        <DropHint>PDF only · max {MAX_SIZE_MB} MB each · max 100 pages</DropHint>
      </DropZone>

      <HiddenInput
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        onChange={handleChange}
      />

      {staged.length > 0 && (
        <FileList>
          {staged.map((s, idx) => {
            const err = s.validationError || s.uploadError;
            return (
              <FileRow key={`${s.file.name}:${s.file.size}:${idx}`} $hasError={!!err}>
                <FileTextOutlined style={{ color: 'var(--blue-5)' }} />
                <FileMeta>
                  <FileName title={s.file.name}>{s.file.name}</FileName>
                  <FileSubline>{humanSize(s.file.size)}</FileSubline>
                  {err && <FileError>{err}</FileError>}
                </FileMeta>
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={uploading}
                  onClick={() => removeAt(idx)}
                />
              </FileRow>
            );
          })}
        </FileList>
      )}

      <Footer>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        <Button
          type="primary"
          loading={uploading}
          disabled={validCount === 0 || uploading}
          onClick={handleUpload}
        >
          {uploadLabel}
        </Button>
      </Footer>
    </Modal>
  );
}
