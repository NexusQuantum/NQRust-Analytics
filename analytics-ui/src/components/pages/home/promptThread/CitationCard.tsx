import React from 'react';
import styled from 'styled-components';
import { FileTextOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

export interface Citation {
  documentId: string;
  filename: string;
  pageNumber: number;
  sectionTitle: string;
  excerpt: string;
}

const Container = styled.div`
  margin-top: 16px;
  border-top: 1px solid var(--gray-3);
  padding-top: 12px;
`;

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: var(--gray-6);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
`;

const CitationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Card = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  background: var(--gray-1);
  border: 1px solid var(--gray-3);
  border-radius: 6px;
`;

const IconWrap = styled.div`
  flex-shrink: 0;
  color: var(--blue-5);
  margin-top: 1px;
`;

const CardBody = styled.div`
  min-width: 0;
`;

const PageRef = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Filename = styled.div`
  font-size: 11px;
  color: var(--gray-6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Excerpt = styled.div`
  font-size: 11px;
  color: var(--gray-7);
  margin-top: 3px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

interface Props {
  citations: Citation[];
}

export default function CitationCard({ citations }: Props) {
  if (!citations || citations.length === 0) return null;

  return (
    <Container>
      <SectionLabel>Sources</SectionLabel>
      <CitationList>
        {citations.map((c, i) => (
          <Card key={i}>
            <IconWrap>
              <FileTextOutlined />
            </IconWrap>
            <CardBody>
              <Tooltip title={c.sectionTitle}>
                <PageRef>
                  {/* pageNumber is 0 for markdown-derived docs (md/docx/pptx)
                      because those have line numbers instead of pages.
                      Hide the "p.X" prefix in that case — the section title
                      (e.g. "Slide 3: ...", "Biodata Pribadi") is enough. */}
                  {c.pageNumber > 0
                    ? `p.${c.pageNumber} — ${c.sectionTitle}`
                    : c.sectionTitle}
                </PageRef>
              </Tooltip>
              <Tooltip title={c.filename}>
                <Filename>{c.filename}</Filename>
              </Tooltip>
              {c.excerpt && <Excerpt>{c.excerpt}</Excerpt>}
            </CardBody>
          </Card>
        ))}
      </CitationList>
    </Container>
  );
}
