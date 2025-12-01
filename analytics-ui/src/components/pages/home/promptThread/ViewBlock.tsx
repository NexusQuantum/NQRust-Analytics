import Link from 'next/link';
import { Button, Tooltip } from 'antd';
import { FileCheck, Save } from 'lucide-react';
import { Path } from '@/utils/enum';
import { ViewInfo } from '@/apollo/client/graphql/__types__';

interface Props {
  view?: ViewInfo;
  onClick: () => void;
}

export default function ViewBlock({ view, onClick }: Props) {
  const isViewSaved = !!view;

  if (isViewSaved) {
    return (
      <div className="gray-6 text-medium">
        <FileCheck className="mr-2" size={16} />
        Generated from stored view{' '}
        <Link
          className="gray-7"
          href={`${Path.Modeling}?viewId=${view.id}&openMetadata=true`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {view.displayName}
        </Link>
      </div>
    );
  }

  return (
    <Tooltip title="Store as View">
      <Button
        className="d-flex justify-center align-center mr-1"
        size="small"
        onClick={onClick}
      >
        <Save size={16} />
      </Button>
    </Tooltip>
  );
}
