import { Button, Drawer } from 'antd';
import { NODE_TYPE } from '@/utils/enum';
import { Pencil } from 'lucide-react';
import { DrawerAction } from '@/hooks/useDrawerAction';
import ModelMetadata, {
  Props as ModelMetadataProps,
} from './metadata/ModelMetadata';
import ViewMetadata, {
  Props as ViewMetadataProps,
} from './metadata/ViewMetadata';

type Metadata = {
  nodeType: NODE_TYPE;
} & ModelMetadataProps &
  ViewMetadataProps;

type Props = DrawerAction<Metadata> & { onEditClick: (value?: any) => void };

export default function MetadataDrawer(props: Props) {
  const { visible, defaultValue, onClose, onEditClick } = props;
  const { displayName, nodeType = NODE_TYPE.MODEL } = defaultValue || {};
  const isModel = nodeType === NODE_TYPE.MODEL;
  const isView = nodeType === NODE_TYPE.VIEW;

  return (
    <Drawer
      visible={visible}
      title={displayName}
      width={760}
      closable
      destroyOnClose
      onClose={onClose}
      extra={
        <Button
          className="d-flex align-center"
          icon={<Pencil className="mr-1" size={16} />}
          onClick={() => onEditClick(defaultValue)}
        >
          Modify
        </Button>
      }
    >
      {isModel && <ModelMetadata {...defaultValue} />}
      {isView && <ViewMetadata {...defaultValue} />}
    </Drawer>
  );
}
