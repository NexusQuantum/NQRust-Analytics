import React from 'react';
import styled from 'styled-components';
import { Dropdown, Menu } from 'antd';
import {
  FolderOutlined,
  EllipsisOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { DocumentFolder } from '@/hooks/useDocumentFolders';

interface Props {
  folder: DocumentFolder;
  onOpen: (folder: DocumentFolder) => void;
  onRename: (folder: DocumentFolder) => void;
  onMove: (folder: DocumentFolder) => void;
  onDelete: (folder: DocumentFolder) => void;
}

const Card = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  background: var(--gray-1);
  border: 1px solid var(--gray-3);
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;

  &:hover {
    border-color: var(--rust-orange-5);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);

    .folder-card__menu {
      opacity: 1;
    }
  }
`;

const IconWrap = styled.div`
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--rust-orange-1);
  color: var(--rust-orange-6);
  font-size: 22px;
  flex-shrink: 0;
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

const Name = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const MenuBtn = styled.button`
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  color: var(--gray-7);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;

  &:hover {
    color: var(--gray-9);
    background: white;
  }
`;

export default function FolderCard({
  folder,
  onOpen,
  onRename,
  onMove,
  onDelete,
}: Props) {
  const menu = (
    <Menu
      onClick={({ key, domEvent }) => {
        domEvent.stopPropagation();
        if (key === 'rename') onRename(folder);
        else if (key === 'move') onMove(folder);
        else if (key === 'delete') onDelete(folder);
      }}
      items={[
        { key: 'rename', icon: <EditOutlined />, label: 'Rename' },
        { key: 'move', icon: <SwapOutlined />, label: 'Move to...' },
        { type: 'divider' as const },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: 'Delete',
          danger: true,
        },
      ]}
    />
  );

  return (
    <Card onClick={() => onOpen(folder)}>
      <IconWrap>
        <FolderOutlined />
      </IconWrap>
      <Body>
        <Name title={folder.name}>{folder.name}</Name>
      </Body>
      <Dropdown overlay={menu} trigger={['click']} placement="bottomRight">
        <MenuBtn
          className="folder-card__menu"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Folder actions for ${folder.name}`}
        >
          <EllipsisOutlined />
        </MenuBtn>
      </Dropdown>
    </Card>
  );
}
