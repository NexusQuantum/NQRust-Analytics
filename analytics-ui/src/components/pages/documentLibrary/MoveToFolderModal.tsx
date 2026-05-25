import React, { useMemo, useState } from 'react';
import { Modal, Tree } from 'antd';
import { FolderOutlined, HomeOutlined } from '@ant-design/icons';
import { DocumentFolder } from '@/hooks/useDocumentFolders';

interface Props {
  visible: boolean;
  title?: string;
  /** All folders in the workspace — for building the tree picker. */
  allFolders: DocumentFolder[];
  /** Disabled IDs — typically the folder being moved + its descendants
   *  (to prevent a folder being moved into its own subtree). For doc
   *  moves this can be empty. */
  disabledFolderIds?: Set<number>;
  /** Initial selected target; null = root. */
  initialSelected?: number | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (targetFolderId: number | null) => Promise<void> | void;
}

const ROOT_KEY = '__root__';

interface TreeNode {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  children?: TreeNode[];
}

/** Build a nested tree from the flat folder list. Tracks visited ids so
 *  a corrupt cycle in the data (shouldn't happen — the service rejects
 *  them on writes — but defensive) can't send the recursion infinite. */
function buildTree(
  folders: DocumentFolder[],
  disabledIds: Set<number>,
): TreeNode {
  const byParent = new Map<number | null, DocumentFolder[]>();
  for (const f of folders) {
    const list = byParent.get(f.parentFolderId) || [];
    list.push(f);
    byParent.set(f.parentFolderId, list);
  }

  const visited = new Set<number>();
  const buildChildren = (parentId: number | null): TreeNode[] => {
    const children = byParent.get(parentId) || [];
    return children
      .filter((f) => !visited.has(f.id))
      .map((f) => {
        visited.add(f.id);
        return {
          key: String(f.id),
          title: f.name,
          icon: <FolderOutlined />,
          disabled: disabledIds.has(f.id),
          children: buildChildren(f.id),
        };
      });
  };

  return {
    key: ROOT_KEY,
    title: 'Document Library (root)',
    icon: <HomeOutlined />,
    children: buildChildren(null),
  };
}

export default function MoveToFolderModal({
  visible,
  title = 'Move to...',
  allFolders,
  disabledFolderIds = new Set(),
  initialSelected = null,
  loading = false,
  onCancel,
  onSubmit,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string>(
    initialSelected === null ? ROOT_KEY : String(initialSelected),
  );

  const treeData = useMemo(
    () => [buildTree(allFolders, disabledFolderIds)],
    [allFolders, disabledFolderIds],
  );

  const handleOk = async () => {
    const target = selectedKey === ROOT_KEY ? null : Number(selectedKey);
    await onSubmit(target);
  };

  return (
    <Modal
      title={title}
      visible={visible}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Move here"
      okButtonProps={{ loading }}
      destroyOnClose
      width={480}
    >
      <Tree
        treeData={treeData}
        showIcon
        defaultExpandAll
        selectedKeys={[selectedKey]}
        onSelect={(keys) => {
          if (keys.length > 0) setSelectedKey(String(keys[0]));
        }}
        style={{ maxHeight: 360, overflow: 'auto' }}
      />
    </Modal>
  );
}
