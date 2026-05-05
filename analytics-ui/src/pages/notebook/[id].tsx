import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { Empty, Spin, Input, Button, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import styled from 'styled-components';

import SourcesPanel from '@/components/sources/SourcesPanel';
import { LIST_NOTEBOOKS } from '@/apollo/client/graphql/notebooks';
import { useNotebookContext } from '@/hooks/useNotebookContext';

const Layout = styled.div`
  display: flex;
  height: 100vh;
  width: 100%;
`;

const Center = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow-y: auto;
`;

const Banner = styled.div`
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #389e0d;
`;

const ChatArea = styled.div`
  flex: 1;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Message = styled.div<{ $role: 'user' | 'assistant' }>`
  padding: 12px 16px;
  border-radius: 8px;
  max-width: 80%;
  ${(p) =>
    p.$role === 'user'
      ? `background: #e6f7ff; align-self: flex-end;`
      : `background: #fafafa; border: 1px solid #eee; align-self: flex-start;`}
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.6;
`;

const InputRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 16px;
  position: sticky;
  bottom: 0;
  background: #fff;
  padding-top: 8px;
`;

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  chunksUsed?: number;
}

export default function NotebookPage() {
  const router = useRouter();
  const notebookId = useMemo(() => {
    const id = router.query.id;
    return id ? Number(Array.isArray(id) ? id[0] : id) : null;
  }, [router.query.id]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);

  // Sync the URL notebook id into the global notebook context so that the
  // chat page (`/home/[id]`) can read the same selection via useNotebookContext.
  const { setNotebookId, notebookId: ctxNotebookId } = useNotebookContext();
  useEffect(() => {
    if (notebookId !== null && ctxNotebookId !== notebookId) {
      setNotebookId(notebookId);
    }
  }, [notebookId, ctxNotebookId, setNotebookId]);

  const { data, loading } = useQuery(LIST_NOTEBOOKS, {
    variables: { projectId: '2' },
    fetchPolicy: 'cache-and-network',
    skip: !notebookId,
  });
  const notebook = useMemo(
    () => (data?.notebooks || []).find((n: any) => n.id === notebookId),
    [data, notebookId],
  );

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) return;
    if (selectedIds.length === 0) {
      message.warning('Select at least one document first');
      return;
    }
    setAsking(true);
    setChat((prev) => [...prev, { role: 'user', text: q }]);
    setQuestion('');

    try {
      const res = await fetch('/api/v1/documents/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          selectedDocumentIds: selectedIds,
          projectId: '2',
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: body.answer || '(empty response)',
          chunksUsed: body.chunks_used,
        },
      ]);
    } catch (e: any) {
      setChat((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${e.message || e}` },
      ]);
    } finally {
      setAsking(false);
    }
  };

  if (!notebookId) {
    return <Empty description="Invalid notebook id" />;
  }
  if (loading && !data) {
    return <Spin />;
  }

  return (
    <Layout>
      <SourcesPanel
        notebookId={notebookId}
        onSelectionChange={setSelectedIds}
      />

      <Center>
        <h2 style={{ margin: 0 }}>
          {notebook?.name || `Notebook #${notebookId}`}
        </h2>
        <div style={{ color: '#888', marginTop: 4, marginBottom: 16 }}>
          {selectedIds.length > 0
            ? `${selectedIds.length} source(s) active as context`
            : 'No active sources — check a document on the left to ask questions about it.'}
        </div>

        <Banner>
          📔 Notebook chat — questions are answered using only the
          documents you check on the left. Citations appear inline as
          [filename, hal. PAGE].
        </Banner>

        <ChatArea>
          {chat.length === 0 ? (
            <div style={{ color: '#bbb', textAlign: 'center', marginTop: 40 }}>
              No questions yet. Try asking something about your sources.
            </div>
          ) : (
            chat.map((m, i) => (
              <Message key={i} $role={m.role}>
                {m.text}
                {m.chunksUsed !== undefined && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#999',
                      marginTop: 8,
                      borderTop: '1px solid #eee',
                      paddingTop: 6,
                    }}
                  >
                    {m.chunksUsed} chunk(s) used
                  </div>
                )}
              </Message>
            ))
          )}
          {asking && (
            <Message $role="assistant">
              <Spin size="small" /> Thinking…
            </Message>
          )}
        </ChatArea>

        <InputRow>
          <Input.TextArea
            placeholder="Ask about your selected documents…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={asking}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleAsk}
            loading={asking}
            disabled={selectedIds.length === 0 || !question.trim()}
          >
            Ask
          </Button>
        </InputRow>
      </Center>
    </Layout>
  );
}
