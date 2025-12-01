import { SETTINGS } from '@/utils/enum';
import { DatabaseIcon, FolderIcon } from '@/utils/icons';

export const getSettingMenu = (menu: SETTINGS) =>
  ({
    [SETTINGS.DATA_SOURCE]: {
      icon: DatabaseIcon,
      label: 'Data source settings',
    },
    [SETTINGS.PROJECT]: {
      icon: FolderIcon,
      label: 'Project settings',
    },
  })[menu] || null;
