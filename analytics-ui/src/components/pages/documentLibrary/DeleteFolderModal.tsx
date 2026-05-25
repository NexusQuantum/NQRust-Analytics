import React, { useState } from 'react';
import { Modal, Radio, Typography, Space } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { DeleteFolderStrategy } from '@/hooks/useDocumentFolders';

const { Text } = Typography;

interface Props {
  visible: boolean;
  folderName: string;
  /** Best-effort counts so the user understands the scope of the
   *  delete. Pass 0 when unknown — the strategy choice still works. */
  childFolderCount?: number;
  documentCount?: number;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (strategy: DeleteFolderStrategy) => Promise<void> | void;
}

/**
 * Two-strategy delete:
 *   - move-to-parent (safe default): contents survive, just lose their
 *     parent folder.
 *   - delete-all: nuke the subtree; documents become root-level (the
 *     storage-level ON DELETE SET NULL handles the unlink).
 *
 * No third option to "delete folder + delete documents" — Analytics
 * treats document deletion as a separate, intentional action.
 */
export default function DeleteFolderModal({
  visible,
  folderName,
  childFolderCount = 0,
  documentCount = 0,
  loading = false,
  onCancel,
  onSubmit,
}: Props) {
  const [strategy, setStrategy] = useState<DeleteFolderStrategy>(
    'move-to-parent',
  );

  const hasContents = childFolderCount > 0 || documentCount > 0;

  const handleOk = async () => {
    await onSubmit(strategy);
  };

  return (
    <Modal
      title={
        <span>
          <WarningOutlined style={{ color: 'var(--red-5)', marginRight: 8 }} />
          Delete folder
        </span>
      }
      visible={visible}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Delete"
      okButtonProps={{ danger: true, loading }}
      destroyOnClose
    >
      <p>
        Delete <Text strong>{folderName}</Text>? This cannot be undone.
      </p>
      {hasContents && (
        <>
          <p style={{ marginTop: 12, color: 'var(--gray-7)' }}>
            This folder contains{' '}
            {childFolderCount > 0 && (
              <>
                <Text strong>{childFolderCount}</Text> subfolder
                {childFolderCount > 1 ? 's' : ''}
              </>
            )}
            {childFolderCount > 0 && documentCount > 0 && ' and '}
            {documentCount > 0 && (
              <>
                <Text strong>{documentCount}</Text> document
                {documentCount > 1 ? 's' : ''}
              </>
            )}
            . What should happen to them?
          </p>
          <Radio.Group
            onChange={(e) => setStrategy(e.target.value)}
            value={strategy}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Radio value="move-to-parent">
                <Text strong>Move contents up one level</Text>
                <div style={{ color: 'var(--gray-6)', fontSize: 13 }}>
                  Subfolders and documents inside become siblings of the
                  deleted folder. Safe — nothing is lost.
                </div>
              </Radio>
              <Radio value="delete-all">
                <Text strong>Delete subfolders too</Text>
                <div style={{ color: 'var(--gray-6)', fontSize: 13 }}>
                  All subfolders are deleted. Documents survive — they
                  return to the root of the library.
                </div>
              </Radio>
            </Space>
          </Radio.Group>
        </>
      )}
    </Modal>
  );
}
