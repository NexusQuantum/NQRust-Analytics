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
    deleteDocument,
    toggleSelection,
  };
}
