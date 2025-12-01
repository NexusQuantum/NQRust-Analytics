import { ReactNode } from 'react';
import { ButtonProps, Modal, ModalProps } from 'antd';
import { AlertCircle, Trash2 } from 'lucide-react';

type DeleteModalProps = {
  disabled?: boolean;
  modalProps?: ModalProps;
  onConfirm: () => void;
  style?: any;
} & Partial<ButtonProps>;

type Config = {
  icon?: ReactNode;
  itemName?: string;
  content?: string;
};

export const makeDeleteModal =
  (Component, config?: Config) => (props: DeleteModalProps) => {
    const { title, content, modalProps = {}, onConfirm, ...restProps } = props;

    return (
      <Component
        icon={config.icon}
        onClick={() =>
          Modal.confirm({
            autoFocusButton: null,
            cancelText: 'No',
            content:
              config?.content ||
              'This will be permanently removed, please confirm you want to proceed.',
            icon: <AlertCircle size={20} />,
            okText: 'Remove',
            onOk: onConfirm,
            title: `Confirm removal of this ${config?.itemName}?`,
            width: 464,
            ...modalProps,
            okButtonProps: {
              ...modalProps.okButtonProps,
              danger: true,
            },
          })
        }
        {...restProps}
      />
    );
  };

const DefaultDeleteButton = (props) => {
  const { icon = null, disabled, ...restProps } = props;
  return (
    <a className={disabled ? '' : 'red-5 d-flex align-center'} {...restProps}>
      {icon}Delete
    </a>
  );
};

export default makeDeleteModal(DefaultDeleteButton);

// Customize delete modal
export const DeleteThreadModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'thread',
  content:
    'This will permanently delete all results history in this thread, please confirm you want to delete it.',
});

export const DeleteViewModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'view',
  content:
    'This will be permanently deleted, please confirm you want to delete it.',
});

export const DeleteModelModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'model',
  content:
    'This will be permanently deleted, please confirm you want to delete it.',
});

export const DeleteCalculatedFieldModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'calculated field',
  content:
    'This will be permanently deleted, please confirm you want to delete it.',
});

export const DeleteRelationshipModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'relationship',
  content:
    'This will be permanently deleted, please confirm you want to delete it.',
});

export const DeleteDashboardItemModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'dashboard item',
  content:
    'This will be permanently deleted, please confirm you want to delete it.',
});

export const DeleteQuestionSQLPairModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'question-SQL pair',
  content:
    'This action is permanent and cannot be undone. Are you sure you want to proceed?',
});

export const DeleteInstructionModal = makeDeleteModal(DefaultDeleteButton, {
  icon: <Trash2 className="mr-2" size={16} />,
  itemName: 'instruction',
  content:
    'This action is permanent and cannot be undone. Are you sure you want to proceed?',
});
