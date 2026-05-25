import { useCallback, useEffect, useState } from 'react';

export interface DocumentFolder {
  id: number;
  name: string;
  parentFolderId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export type DeleteFolderStrategy = 'move-to-parent' | 'delete-all';

interface UseDocumentFoldersReturn {
  /** Folders in the *current* view (children of currentFolderId). */
  folders: DocumentFolder[];
  /** Breadcrumb path from root → current folder. Empty when at root. */
  breadcrumb: DocumentFolder[];
  /** Flat list of all folders — used by the Move-to picker. */
  allFolders: DocumentFolder[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createFolder: (
    name: string,
    parentFolderId: number | null,
  ) => Promise<DocumentFolder>;
  renameFolder: (folderId: number, name: string) => Promise<void>;
  deleteFolder: (
    folderId: number,
    strategy: DeleteFolderStrategy,
  ) => Promise<void>;
  moveFolder: (
    folderId: number,
    newParentId: number | null,
  ) => Promise<void>;
  moveDocument: (
    documentId: string,
    folderId: number | null,
  ) => Promise<void>;
}

export function useDocumentFolders(
  currentFolderId: number | null,
): UseDocumentFoldersReturn {
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<DocumentFolder[]>([]);
  const [allFolders, setAllFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parentParam = currentFolderId === null ? 'root' : currentFolderId;
      const [childrenRes, allRes, breadcrumbRes] = await Promise.all([
        fetch(`/api/v1/documents/folders?parentId=${parentParam}`),
        fetch('/api/v1/documents/folders'),
        currentFolderId != null
          ? fetch(`/api/v1/documents/folders/${currentFolderId}`)
          : Promise.resolve(null),
      ]);

      // Read the error body once per failed response so we can surface
      // a meaningful message instead of dropping the failure on the
      // floor.
      const readError = async (
        res: Response,
        fallback: string,
      ): Promise<string> => {
        const data = await res.json().catch(() => null);
        return data?.error || fallback;
      };

      if (!childrenRes.ok) {
        throw new Error(await readError(childrenRes, 'Failed to load folders'));
      }
      const childrenData = await childrenRes.json();
      setFolders(childrenData.folders || []);

      if (!allRes.ok) {
        throw new Error(await readError(allRes, 'Failed to load folder list'));
      }
      const allData = await allRes.json();
      setAllFolders(allData.folders || []);

      if (breadcrumbRes) {
        if (!breadcrumbRes.ok) {
          throw new Error(
            await readError(breadcrumbRes, 'Failed to load breadcrumb'),
          );
        }
        const data = await breadcrumbRes.json();
        setBreadcrumb(data.breadcrumb || []);
      } else {
        setBreadcrumb([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const createFolder = useCallback(
    async (name: string, parentFolderId: number | null) => {
      const res = await fetch('/api/v1/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentFolderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create folder');
      }
      const folder = await res.json();
      await fetchAll();
      return folder as DocumentFolder;
    },
    [fetchAll],
  );

  const renameFolder = useCallback(
    async (folderId: number, name: string) => {
      const res = await fetch(`/api/v1/documents/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to rename folder');
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const deleteFolder = useCallback(
    async (folderId: number, strategy: DeleteFolderStrategy) => {
      const res = await fetch(
        `/api/v1/documents/folders/${folderId}?strategy=${strategy}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete folder');
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const moveFolder = useCallback(
    async (folderId: number, newParentId: number | null) => {
      const res = await fetch(`/api/v1/documents/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentFolderId: newParentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to move folder');
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const moveDocument = useCallback(
    async (documentId: string, folderId: number | null) => {
      const res = await fetch(
        `/api/v1/documents/${documentId}/folder`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to move document');
      }
      await fetchAll();
    },
    [fetchAll],
  );

  return {
    folders,
    breadcrumb,
    allFolders,
    loading,
    error,
    refetch: fetchAll,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    moveDocument,
  };
}
