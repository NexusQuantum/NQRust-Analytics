import React, { useState } from 'react';
import { Modal, Upload, message, Button } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps, UploadFile, RcFile } from 'antd/lib/upload/interface';

const ACCEPT_EXTENSIONS =
  '.pdf,.docx,.pptx,.xlsx,.md,.markdown,.txt,.html,.htm';
const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB — must match server-side limit

interface Props {
  open: boolean;
  notebookId: number;
  onClose: () => void;
  /** Called once *all* selected files finished uploading (success or fail). */
  onCompleted: () => void;
}

export default function UploadDialog({
  open,
  notebookId,
  onClose,
  onCompleted,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);

  const beforeUpload: UploadProps['beforeUpload'] = (file: RcFile) => {
    if (file.size > MAX_FILE_BYTES) {
      message.error(`${file.name} exceeds 30 MB limit`);
      return Upload.LIST_IGNORE;
    }
    return false; // intercept; we manually upload on submit
  };

  const handleSubmit = async () => {
    if (files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let failCount = 0;

    for (const file of files) {
      try {
        // antd's Upload wraps the real File at `originFileObj`. Some setups
        // (e.g. when beforeUpload returns false) put it directly as the
        // entry, so support both shapes.
        const realFile: File | undefined =
          (file as any).originFileObj || ((file as any) as File);
        if (!realFile || typeof (realFile as any).arrayBuffer !== 'function') {
          throw new Error('Cannot read uploaded file from picker');
        }
        const fd = new FormData();
        fd.append('file', realFile, (file as any).name || realFile.name);
        fd.append('notebookId', String(notebookId));
        const res = await fetch('/api/v1/documents/upload', {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        okCount++;
      } catch (e: any) {
        failCount++;
        message.error(`${file.name}: ${e.message || e}`);
      }
    }

    setUploading(false);
    setFiles([]);
    if (okCount > 0) {
      message.success(
        `Uploaded ${okCount} file(s)${failCount ? `, ${failCount} failed` : ''}`,
      );
    }
    onCompleted();
    onClose();
  };

  return (
    <Modal
      title="Upload sources"
      visible={open}
      onCancel={() => {
        if (!uploading) {
          setFiles([]);
          onClose();
        }
      }}
      footer={[
        <Button
          key="cancel"
          onClick={() => {
            setFiles([]);
            onClose();
          }}
          disabled={uploading}
        >
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={uploading}
          disabled={files.length === 0}
          onClick={handleSubmit}
        >
          Upload {files.length > 0 ? `(${files.length})` : ''}
        </Button>,
      ]}
      destroyOnClose
    >
      <Upload.Dragger
        multiple
        accept={ACCEPT_EXTENSIONS}
        beforeUpload={beforeUpload}
        fileList={files}
        onChange={({ fileList }) => setFiles(fileList)}
        onRemove={(f) => {
          setFiles(files.filter((x) => x.uid !== f.uid));
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          Click or drag PDF/DOCX/MD/TXT here to upload
        </p>
        <p className="ant-upload-hint">
          Max 30 MB per file. Supported: PDF, DOCX, PPTX, XLSX, MD, TXT, HTML.
        </p>
      </Upload.Dragger>
    </Modal>
  );
}
