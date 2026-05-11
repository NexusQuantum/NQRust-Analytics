import React from 'react';
import { Typography, Spin, Collapse } from 'antd';
import { FileTextOutlined, BookOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import styled from 'styled-components';
import {
  AskingTaskStatus,
  AskingTaskType,
  ThreadResponse,
} from '@/apollo/client/graphql/__types__';

const { Text } = Typography;

const CitationCard = styled.div`
  border: 1px solid var(--gray-4);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 8px;
  background: var(--gray-2);

  .citation-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .citation-excerpt {
    font-size: 13px;
    color: var(--gray-7);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`;

const AnswerContent = styled.div`
  line-height: 1.7;
  font-size: 15px;

  p { margin-bottom: 8px; }
  ul, ol { padding-left: 20px; margin-bottom: 8px; }
  strong { font-weight: 600; }
  h2 { font-size: 14px; font-weight: 600; margin: 12px 0 6px; }
`;

interface DocumentBasedAnswerProps {
  threadResponse: ThreadResponse;
}

export default function DocumentBasedAnswer({ threadResponse }: DocumentBasedAnswerProps) {
  const { askingTask, documentAnswerDetail } = threadResponse;

  const isLoading =
    askingTask?.type === AskingTaskType.DOCUMENT_BASED &&
    askingTask?.status !== AskingTaskStatus.FINISHED &&
    askingTask?.status !== AskingTaskStatus.FAILED &&
    askingTask?.status !== AskingTaskStatus.STOPPED;

  const status = askingTask?.status;

  const statusLabel = {
    [AskingTaskStatus.CLASSIFYING]: 'Classifying question...',
    [AskingTaskStatus.RETRIEVING]: 'Retrieving relevant passages...',
    [AskingTaskStatus.GENERATING]: 'Generating answer...',
  }[status] || 'Processing...';

  const answer = documentAnswerDetail || askingTask?.documentAnswer;

  if (isLoading && !answer) {
    return (
      <div className="d-flex align-center gx-2 py-4">
        <Spin size="small" />
        <Text className="gray-6 ml-2">{statusLabel}</Text>
      </div>
    );
  }

  if (askingTask?.status === AskingTaskStatus.FAILED) {
    return (
      <div className="py-4">
        <Text className="red-5">Failed to answer from documents. Please try again.</Text>
      </div>
    );
  }

  if (!answer) return null;

  const citations = answer.citations || [];

  return (
    <div className="py-2">
      <AnswerContent>
        <ReactMarkdown>{answer.content}</ReactMarkdown>
      </AnswerContent>

      {citations.length > 0 && (
        <div className="mt-4">
          <Collapse ghost>
            <Collapse.Panel
              key="citations"
              header={
                <div className="d-flex align-center gx-2">
                  <BookOutlined />
                  <Text className="text-sm gray-7">
                    {citations.length} source{citations.length > 1 ? 's' : ''}
                  </Text>
                </div>
              }
            >
              <div>
                {citations.map((citation, i) => (
                  <CitationCard key={i}>
                    <div className="citation-header">
                      <FileTextOutlined style={{ color: 'var(--gray-6)', fontSize: 13 }} />
                      <Text className="text-sm text-semi-bold gray-8">
                        {citation.filename || `Document ${citation.documentId.slice(0, 8)}`}
                      </Text>
                      {citation.pageNumber != null && (
                        <Text className="text-sm gray-6">· p.{citation.pageNumber}</Text>
                      )}
                      {citation.sectionTitle && (
                        <Text className="text-sm gray-6">· {citation.sectionTitle}</Text>
                      )}
                    </div>
                    {citation.excerpt && (
                      <div className="citation-excerpt">{citation.excerpt}</div>
                    )}
                  </CitationCard>
                ))}
              </div>
            </Collapse.Panel>
          </Collapse>
        </div>
      )}
    </div>
  );
}
