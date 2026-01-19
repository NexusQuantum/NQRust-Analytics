import { useState } from 'react';
import styled from 'styled-components';
import { Dropdown, Menu } from 'antd';
import MoreOutlined from '@ant-design/icons/MoreOutlined';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';
import { Pencil } from 'lucide-react';
import LabelTitle from '@/components/sidebar/LabelTitle';
import TreeTitleInput from '@/components/sidebar/home/TreeTitleInput';
import { DeleteThreadModal } from '@/components/modals/DeleteModal';

const MENU_ITEM_KEYS = {
  RENAME: 'rename',
  SHARE: 'share',
  DELETE: 'delete',
};

const StyledMenu = styled(Menu)`
  a:hover {
    color: white;
  }
`;

interface TreeTitleProps {
  id: string;
  title: string;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  onShare?: (id: string, name: string) => void;
}

export default function TreeTitle(props: TreeTitleProps) {
  const { id, onDelete, onRename, onShare } = props;
  const [title, setTitle] = useState(props.title);
  const [isEditing, setIsEditing] = useState(false);

  const onCancelChange = () => {
    setIsEditing(false);
    setTitle(props.title);
  };

  const onChangeTitle = (newThreadTitle: string) => {
    setIsEditing(false);
    setTitle(newThreadTitle);
    onRename && onRename(id, newThreadTitle);
  };

  const onDeleteData = (id: string) => {
    onDelete && onDelete(id);
  };

  return isEditing ? (
    <TreeTitleInput
      title={title}
      onCancelChange={onCancelChange}
      onSetTitle={setTitle}
      onRename={onChangeTitle}
    />
  ) : (
    <LabelTitle
      title={title}
      appendIcon={
        <Dropdown
          trigger={['click']}
          overlayStyle={{ userSelect: 'none', minWidth: 150 }}
          overlay={
            <StyledMenu
              items={[
                {
                  label: (
                    <span className="d-flex align-center">
                      <Pencil className="mr-2" size={16} />
                      Rename
                    </span>
                  ),
                  key: MENU_ITEM_KEYS.RENAME,
                  onClick: ({ domEvent }) => {
                    domEvent.stopPropagation();
                    setIsEditing(true);
                  },
                },
                {
                  label: (
                    <span className="d-flex align-center">
                      <ShareAltOutlined className="mr-2" style={{ fontSize: 16 }} />
                      Share
                    </span>
                  ),
                  key: MENU_ITEM_KEYS.SHARE,
                  onClick: ({ domEvent }) => {
                    domEvent.stopPropagation();
                    onShare && onShare(id, title);
                  },
                },
                {
                  label: (
                    <DeleteThreadModal onConfirm={() => onDeleteData(id)} />
                  ),
                  key: MENU_ITEM_KEYS.DELETE,
                  onClick: ({ domEvent }) => {
                    domEvent.stopPropagation();
                  },
                },
              ]}
            />
          }
        >
          <MoreOutlined onClick={(event) => event.stopPropagation()} />
        </Dropdown>
      }
    />
  );
}
