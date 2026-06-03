import React from 'react';
import { Breadcrumb, Tooltip } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { DocumentFolder } from '@/hooks/useDocumentFolders';

interface Props {
  breadcrumb: DocumentFolder[];
  /** Called with `null` when the user clicks the root crumb, otherwise
   *  the folder id of the clicked segment. */
  onNavigate: (folderId: number | null) => void;
}

const Wrap = styled.div`
  margin-bottom: 16px;

  /* All crumbs default to orange so the clickable ones look like links.
     Hover adds an underline as the standard link affordance. */
  .ant-breadcrumb-link {
    cursor: pointer;
    color: var(--rust-orange-6);
    transition: color 0.15s;
  }
  .ant-breadcrumb-link:hover {
    color: var(--rust-orange-7);
    text-decoration: underline;
  }
  /* The last crumb is the page you're on — render as plain text so it
     doesn't look like a link. */
  .ant-breadcrumb > span:last-child .ant-breadcrumb-link {
    color: var(--gray-9);
    font-weight: 500;
    cursor: default;
    text-decoration: none;
  }
`;

// Antd 4.20 doesn't have the `items` API yet — render <Breadcrumb.Item>
// children directly. The last crumb is rendered as plain text (no click
// handler) since clicking the page you're already on is a no-op.
export default function FolderBreadcrumb({ breadcrumb, onNavigate }: Props) {
  return (
    <Wrap>
      <Breadcrumb>
        <Breadcrumb.Item onClick={() => onNavigate(null)}>
          <Tooltip title="Document Library root" placement="bottom">
            <HomeOutlined />
          </Tooltip>
        </Breadcrumb.Item>
        {breadcrumb.map((folder, idx) => {
          const isLast = idx === breadcrumb.length - 1;
          return (
            <Breadcrumb.Item
              key={folder.id}
              onClick={isLast ? undefined : () => onNavigate(folder.id)}
            >
              {folder.name}
            </Breadcrumb.Item>
          );
        })}
      </Breadcrumb>
    </Wrap>
  );
}
