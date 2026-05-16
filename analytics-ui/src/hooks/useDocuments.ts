import { useState, useEffect, useCallback } from 'react';

export interface DocumentItem {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  pageCount: number | null;
  status: 'pending' | 'indexing' | 'indexed' | 'failed';
  errorMessage: string | null;
  indexedAt: string | null;
  createdAt: string;
}

interface UseDocumentsReturn {
  documents: DocumentItem[];
  selectedIds: string[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
  uploadDocuments: (
    files: File[],
  ) => Promise<{ file: string; error: string }[]>;
  deleteDocument: (id: string) => Promise<void>;
  toggleSelection: (id: string) => Promise<void>;
}

export function useDocuments(): UseDocumentsReturn {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const [docsRes, selRes] = await Promise.all([
        fetch('/api/v1/documents'),
        fetch('/api/v1/documents/selection'),
      ]);

      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }
      if (selRes.ok) {
        const data = await selRes.json();
        setSelectedIds(data.documentIds || []);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadDocument = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchDocuments]);

  const uploadDocuments = useCallback(
    async (files: File[]): Promise<{ file: string; error: string }[]> => {
      if (files.length === 0) return [];
      setLoading(true);
      setError(null);
      const failures: { file: string; error: string }[] = [];
      try {
        const results = await Promise.allSettled(
          files.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/v1/documents/upload', {
              method: 'POST',
              body: formData,
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `Upload failed (${res.status})`);
            }
          }),
        );
        results.forEach((r, idx) => {
          if (r.status === 'rejected') {
            failures.push({
              file: files[idx].name,
              error: r.reason?.message || 'Upload failed',
            });
          }
        });
        if (failures.length === files.length) {
          setError(failures[0].error);
        }
        await fetchDocuments();
        return failures;
      } finally {
        setLoading(false);
      }
    },
    [fetchDocuments],
  );

  const deleteDocument = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      await fetchDocuments();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchDocuments]);

  const toggleSelection = useCallback(async (id: string) => {
    const newIds = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : selectedIds.length >= 5
        ? selectedIds // max 5
        : [...selectedIds, id];

    try {
      const res = await fetch('/api/v1/documents/selection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: newIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Selection update failed');
      }
      setSelectedIds(newIds);
    } catch (err: any) {
      setError(err.message);
    }
  }, [selectedIds]);

  return {
    documents,
    selectedIds,
    loading,
    error,
    refetch: fetchDocuments,
    uploadDocument,
    uploadDocuments,
    deleteDocument,
    toggleSelection,
  };
}
