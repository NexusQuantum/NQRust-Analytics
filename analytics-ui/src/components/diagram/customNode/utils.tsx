import { CachedProps } from '@/utils/data';
import { LightningIcon } from '@/utils/icons';
import { Tooltip } from 'antd';
import { NodeProps } from 'reactflow';
import styled from 'styled-components';

export type CustomNodeProps<T> = NodeProps<{
  originalData: T;
  index: number;
  highlight: string[];
}>;

export const StyledNode = styled.div`
  position: relative;
  width: 200px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--gray-1);
  box-shadow:
    0px 3px 6px -4px rgba(0, 0, 0, 0.12),
    0px 6px 16px rgba(0, 0, 0, 0.08),
    0px 9px 28px 8px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;

  &:before {
    content: '';
    pointer-events: none;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    border: 2px solid transparent;
    transition: border-color 0.15s ease-in-out;
  }

  &:hover,
  &:focus {
    &:before {
      border-color: var(--rust-orange-6);
      border-radius: 8px;
    }
  }

  .react-flow__handle {
    border: none;
    opacity: 0;

    &-left {
      left: 0;
    }

    &-right {
      right: 0;
    }
  }
`;

export const NodeHeader = styled.div`
  position: relative;
  background-color: ${(props) => props.color || 'var(--rust-orange-6)'};
  font-size: 14px;
  color: white;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    'Helvetica Neue',
    Arial,
    sans-serif;
  font-weight: 500;

  &.dragHandle {
    cursor: move;
  }

  .adm-model-header {
    display: flex;
    align-items: center;

    svg {
      margin-right: 6px;
    }
    + svg {
      cursor: pointer;
    }

    .ant-typography {
      width: 140px;
      color: white;
      font-family:
        'Inter',
        -apple-system,
        BlinkMacSystemFont,
        'Segoe UI',
        Roboto,
        'Helvetica Neue',
        Arial,
        sans-serif;
      font-weight: 500;
    }
  }
`;

export const NodeBody = styled.div`
  background-color: white;
  padding-bottom: 4px;
`;

export const CachedIcon = ({ originalData }: { originalData: CachedProps }) => {
  return originalData.cached ? (
    <Tooltip
      title={
        <>
          Cached
          {originalData.refreshTime
            ? `: refresh every ${originalData.refreshTime}`
            : null}
        </>
      }
      placement="top"
    >
      <LightningIcon className="cursor-pointer" />
    </Tooltip>
  ) : null;
};
