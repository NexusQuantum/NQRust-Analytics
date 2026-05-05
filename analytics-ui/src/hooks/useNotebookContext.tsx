/**
 * Lightweight global context that lets the chat page (`/home/[id]`) know
 * which notebook is "attached" and which of its documents are checked.
 *
 * The SourcesPanel writes here; useAskPrompt.onSubmit reads from here.
 * Persisted in localStorage so a refresh keeps the user's selection.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

interface NotebookCtxValue {
  notebookId: number | null;
  selectedDocumentIds: number[];
  setNotebookId: (id: number | null) => void;
  setSelectedDocumentIds: (ids: number[]) => void;
  /** Read the latest values without re-rendering — used by ask submit. */
  getSnapshot: () => { notebookId: number | null; selectedDocumentIds: number[] };
}

const NotebookContext = createContext<NotebookCtxValue | null>(null);

const LS_KEY = 'nqrust:notebookCtx';

export function NotebookProvider({ children }: { children: ReactNode }) {
  const [notebookId, setNotebookIdState] = useState<number | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIdsState] = useState<number[]>(
    [],
  );

  // Hydrate from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.notebookId === 'number') {
        setNotebookIdState(parsed.notebookId);
      }
      if (Array.isArray(parsed.selectedDocumentIds)) {
        setSelectedDocumentIdsState(
          parsed.selectedDocumentIds.filter((x: any) => typeof x === 'number'),
        );
      }
    } catch {
      // corrupt localStorage entry — ignore
    }
  }, []);

  // Mirror state to a ref so getSnapshot is always current.
  const ref = useRef({ notebookId, selectedDocumentIds });
  useEffect(() => {
    ref.current = { notebookId, selectedDocumentIds };
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ notebookId, selectedDocumentIds }),
      );
    } catch {
      // ignore
    }
  }, [notebookId, selectedDocumentIds]);

  const setNotebookId = useCallback((id: number | null) => {
    setNotebookIdState(id);
    // When switching notebook, clear selection (it's per-notebook anyway).
    setSelectedDocumentIdsState([]);
  }, []);

  const setSelectedDocumentIds = useCallback((ids: number[]) => {
    setSelectedDocumentIdsState(ids);
  }, []);

  const getSnapshot = useCallback(() => ref.current, []);

  const value = useMemo<NotebookCtxValue>(
    () => ({
      notebookId,
      selectedDocumentIds,
      setNotebookId,
      setSelectedDocumentIds,
      getSnapshot,
    }),
    [
      notebookId,
      selectedDocumentIds,
      setNotebookId,
      setSelectedDocumentIds,
      getSnapshot,
    ],
  );

  return (
    <NotebookContext.Provider value={value}>
      {children}
    </NotebookContext.Provider>
  );
}

export function useNotebookContext(): NotebookCtxValue {
  const ctx = useContext(NotebookContext);
  if (!ctx) {
    // Fallback so non-notebook pages don't crash. Callers can still call
    // get/set safely; the data simply won't persist.
    return {
      notebookId: null,
      selectedDocumentIds: [],
      setNotebookId: () => undefined,
      setSelectedDocumentIds: () => undefined,
      getSnapshot: () => ({ notebookId: null, selectedDocumentIds: [] }),
    };
  }
  return ctx;
}
