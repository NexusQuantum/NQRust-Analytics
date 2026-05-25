import React, { useEffect, useState } from 'react';
import { Modal, Input, Form } from 'antd';

interface Props {
  visible: boolean;
  title: string;
  /** Pre-filled name when editing; empty when creating. */
  initialName?: string;
  okText?: string;
  /** Loading state on the OK button while the parent's mutation runs. */
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}

/**
 * Shared modal for both "Create folder" and "Rename folder" — the only
 * difference is the title, OK button label, and pre-filled value.
 */
export default function FolderNameModal({
  visible,
  title,
  initialName = '',
  okText = 'Save',
  loading = false,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName);

  // Reset the input whenever the modal re-opens, so editing one folder
  // then opening "create" doesn't carry the old value over.
  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= 100;

  const handleOk = async () => {
    if (!canSubmit) return;
    await onSubmit(trimmed);
  };

  return (
    <Modal
      title={title}
      visible={visible}
      onCancel={onCancel}
      onOk={handleOk}
      okText={okText}
      okButtonProps={{ disabled: !canSubmit, loading }}
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label="Folder name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Reports, Contracts, 2026"
            maxLength={100}
            autoFocus
            onPressEnter={handleOk}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
