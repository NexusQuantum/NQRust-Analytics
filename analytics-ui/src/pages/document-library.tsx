import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Empty,
  Modal as AntModal,
  Skeleton,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  InboxOutlined,
  FolderAddOutlined,
} from '@ant-design/icons';
import styled from 'styled-components';
import SiderLayout from '@/components/layouts/SiderLayout';
import PageLayout from '@/components/layouts/PageLayout';
import UploadDialog from '@/components/sidebar/home/UploadDialog';
import DocumentCard from '@/components/pages/documentLibrary/DocumentCard';
import FolderCard from '@/components/pages/documentLibrary/FolderCard';
import FolderBreadcrumb from '@/components/pages/documentLibrary/FolderBreadcrumb';
import FolderNameModal from '@/components/pages/documentLibrary/FolderNameModal';
import MoveToFolderModal from '@/components/pages/documentLibrary/MoveToFolderModal';
import DeleteFolderModal from '@/components/pages/documentLibrary/DeleteFolderModal';
import { useDocuments, DocumentItem } from '@/hooks/useDocuments';
import {
  useDocumentFolders,
  DocumentFolder,
} from '@/hooks/useDocumentFolders';
import { MAX_DOCUMENT_SELECTION } from '@/utils/documentFormats';

const { Text } = Typography;

const POLL_INTERVAL_MS = 3000;

const SelectionBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--gray-2);
  border: 1px solid var(--gray-4);
  border-radius: 6px;
  font-size: 12px;
  color: var(--gray-8);
  margin-right: 12px;
`;

const SectionLabel = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 8px 0 12px;
`;

const FolderGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  align-items: stretch;
`;

const SkeletonCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--gray-3);
  border-radius: 10px;
  background: var(--gray-1);
`;

const SkeletonThumb = styled.div`
  align-self: center;
  width: 180px;
  height: ${Math.round(180 * (11 / 8.5))}px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--gray-2) 0%,
    var(--gray-3) 50%,
    var(--gray-2) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const EmptyState = styled.div`
  padding: 64px 24px;
  border: 1px dashed var(--gray-4);
  border-radius: 12px;
  background: var(--gray-1);
  text-align: center;
`;

export default function DocumentLibraryPage() {
  const router = useRouter();

  // Current folder from URL `?folder=<id>`. `null` = root.
  // The router value is `string | string[] | undefined`; we coerce it to
  // a number-or-null so downstream hooks see a clean shape.
  const currentFolderId = useMemo<number | null>(() => {
    const raw = router.query.folder;
    if (raw == null) return null;
    const parsed = Number.parseInt(String(raw), 10);
    return Number.isInteger(parsed) ? parsed : null;
  }, [router.query.folder]);

  const navigateToFolder = (folderId: number | null) => {
    const nextQuery = { ...router.query };
    if (folderId === null) {
      delete nextQuery.folder;
    } else {
      nextQuery.folder = String(folderId);
    }
    router.push({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true,
    });
  };

  const {
    documents,
    selectedIds,
    loading,
    error,
    refetch,
    uploadDocuments,
    deleteDocument,
    toggleSelection,
  } = useDocuments(currentFolderId);

  const {
    folders,
    breadcrumb,
    allFolders,
    error: folderError,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    moveDocument,
  } = useDocumentFolders(currentFolderId);

  const [uploadOpen, setUploadOpen] = useState(false);

  // Modal state — we keep it together so we can render all four modals
  // from one place without prop-drilling.
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentFolder | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<DocumentFolder | null>(null);
  const [moveDocTarget, setMoveDocTarget] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentFolder | null>(null);
  // Subtree counts for the delete-folder modal — fetched server-side
  // because the client only knows about the *current* view's docs and
  // would otherwise undercount when the user deletes from a parent.
  const [deleteStats, setDeleteStats] = useState<{
    childFolderCount: number;
    documentCount: number;
  } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const openDeleteFolder = async (folder: DocumentFolder) => {
    setDeleteTarget(folder);
    setDeleteStats(null);
    try {
      const res = await fetch(
        `/api/v1/documents/folders/${folder.id}?stats=1`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.stats) setDeleteStats(data.stats);
      }
    } catch {
      // Non-fatal — modal still works with childFolderCount=0/documentCount=0
      // and the delete itself doesn't depend on these numbers.
    }
  };

  // Poll while any document is still being indexed.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasIndexing = documents.some(
    (d) => d.status === 'indexing' || d.status === 'pending',
  );

  useEffect(() => {
    if (hasIndexing) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          refetch();
        }, POLL_INTERVAL_MS);
      }
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [hasIndexing, refetch]);

  const handleDeleteDoc = (doc: DocumentItem) => {
    AntModal.confirm({
      title: 'Remove document',
      content: (
        <>
          Remove <Text strong>{doc.originalFilename || doc.filename}</Text> and
          its index? This cannot be undone.
        </>
      ),
      okText: 'Remove',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDocument(doc.id);
          message.success('Document removed');
        } catch (e: any) {
          message.error(e?.message || 'Failed to remove document');
        }
      },
    });
  };

  // ── Folder action handlers ────────────────────────────────────────────

  const handleCreateFolder = async (name: string) => {
    setModalLoading(true);
    try {
      await createFolder(name, currentFolderId);
      message.success(`Folder "${name}" created`);
      setCreateFolderOpen(false);
    } catch (e: any) {
      message.error(e?.message || 'Failed to create folder');
    } finally {
      setModalLoading(false);
    }
  };

  const handleRenameFolder = async (name: string) => {
    if (!renameTarget) return;
    setModalLoading(true);
    try {
      await renameFolder(renameTarget.id, name);
      message.success('Folder renamed');
      setRenameTarget(null);
    } catch (e: any) {
      message.error(e?.message || 'Failed to rename folder');
    } finally {
      setModalLoading(false);
    }
  };

  const handleMoveFolder = async (newParentId: number | null) => {
    if (!moveFolderTarget) return;
    setModalLoading(true);
    try {
      await moveFolder(moveFolderTarget.id, newParentId);
      message.success('Folder moved');
      setMoveFolderTarget(null);
    } catch (e: any) {
      message.error(e?.message || 'Failed to move folder');
    } finally {
      setModalLoading(false);
    }
  };

  const handleMoveDocument = async (folderId: number | null) => {
    if (!moveDocTarget) return;
    setModalLoading(true);
    try {
      await moveDocument(moveDocTarget.id, folderId);
      message.success('Document moved');
      setMoveDocTarget(null);
      // refetch documents list since the doc may no longer be in current view
      await refetch();
    } catch (e: any) {
      message.error(e?.message || 'Failed to move document');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteFolder = async (
    strategy: 'move-to-parent' | 'delete-all',
  ) => {
    if (!deleteTarget) return;
    setModalLoading(true);
    try {
      await deleteFolder(deleteTarget.id, strategy);
      message.success('Folder deleted');
      setDeleteTarget(null);
      setDeleteStats(null);
      await refetch();
    } catch (e: any) {
      message.error(e?.message || 'Failed to delete folder');
    } finally {
      setModalLoading(false);
    }
  };

  // ── Compute UI state ──────────────────────────────────────────────────

  // When moving a folder, exclude self + descendants from the target
  // picker. Without this, the user could create an orphan cycle.
  const moveFolderDisabledIds = useMemo(() => {
    if (!moveFolderTarget) return new Set<number>();
    const disabled = new Set<number>([moveFolderTarget.id]);
    // BFS through allFolders to collect all descendants of the target.
    const stack = [moveFolderTarget.id];
    while (stack.length) {
      const current = stack.pop()!;
      for (const f of allFolders) {
        if (f.parentFolderId === current && !disabled.has(f.id)) {
          disabled.add(f.id);
          stack.push(f.id);
        }
      }
    }
    return disabled;
  }, [moveFolderTarget, allFolders]);

  const selectionCount = selectedIds.length;
  const selectionAtMax = selectionCount >= MAX_DOCUMENT_SELECTION;
  const initialLoading = loading && documents.length === 0 && folders.length === 0;
  const isEmpty = documents.length === 0 && folders.length === 0;
  const combinedError = error || folderError;

  return (
    <SiderLayout loading={false}>
      <PageLayout
        title="Document Library"
        titleExtra={
          <div className="d-flex align-center">
            <SelectionBadge>
              <span>
                <strong>{selectionCount}</strong>/{MAX_DOCUMENT_SELECTION}
              </span>
              <span style={{ color: 'var(--gray-6)' }}>selected for chat</span>
            </SelectionBadge>
            <Button
              icon={<FolderAddOutlined />}
              onClick={() => setCreateFolderOpen(true)}
              style={{ marginRight: 8 }}
            >
              New folder
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              Upload documents
            </Button>
          </div>
        }
        description={
          <>
            Manage documents used as a knowledge base for chat. Organize with
            folders, then pick up to {MAX_DOCUMENT_SELECTION} documents to
            include as context in new chat turns. Selection is global — every
            chat thread sees the same set.{' '}
            <Link
              className="gray-8 underline"
              href="https://docs.getanalytics.ai/oss/guide/knowledge/documents"
              rel="noopener noreferrer"
              target="_blank"
            >
              Learn more.
            </Link>
          </>
        }
      >
        <FolderBreadcrumb
          breadcrumb={breadcrumb}
          onNavigate={navigateToFolder}
        />

        {combinedError && (
          <Alert
            type="error"
            message={combinedError}
            closable
            style={{ marginBottom: 12 }}
          />
        )}

        {initialLoading ? (
          <Grid>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i}>
                <SkeletonThumb />
                <Skeleton
                  active
                  title={false}
                  paragraph={{ rows: 2, width: ['80%', '40%'] }}
                />
              </SkeletonCard>
            ))}
          </Grid>
        ) : isEmpty ? (
          <EmptyState>
            <Empty
              image={
                <InboxOutlined
                  style={{ fontSize: 64, color: 'var(--gray-5)' }}
                />
              }
              imageStyle={{ height: 80 }}
              description={
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      color: 'var(--gray-8)',
                      marginBottom: 4,
                    }}
                  >
                    {currentFolderId
                      ? 'This folder is empty'
                      : 'No documents or folders yet'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray-6)' }}>
                    Upload PDFs, Markdown, Word, or PowerPoint files — or
                    create a folder to organize them.
                  </div>
                </div>
              }
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setUploadOpen(true)}
              >
                Upload your first document
              </Button>
            </Empty>
          </EmptyState>
        ) : (
          <>
            {folders.length > 0 && (
              <>
                <SectionLabel>Folders</SectionLabel>
                <FolderGrid>
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onOpen={(f) => navigateToFolder(f.id)}
                      onRename={(f) => setRenameTarget(f)}
                      onMove={(f) => setMoveFolderTarget(f)}
                      onDelete={openDeleteFolder}
                    />
                  ))}
                </FolderGrid>
              </>
            )}

            {documents.length > 0 && (
              <>
                {folders.length > 0 && <SectionLabel>Documents</SectionLabel>}
                <Grid>
                  {documents.map((doc) => {
                    const isSelected = selectedIds.includes(doc.id);
                    return (
                      <DocumentCard
                        key={doc.id}
                        doc={doc}
                        isSelected={isSelected}
                        selectionDisabled={selectionAtMax}
                        onToggle={toggleSelection}
                        onDelete={handleDeleteDoc}
                        onMove={(d) => setMoveDocTarget(d)}
                      />
                    );
                  })}
                </Grid>
              </>
            )}
          </>
        )}

        <UploadDialog
          visible={uploadOpen}
          uploading={loading}
          onClose={() => setUploadOpen(false)}
          onUpload={uploadDocuments}
        />

        <FolderNameModal
          visible={createFolderOpen}
          title="Create folder"
          okText="Create"
          loading={modalLoading}
          onCancel={() => setCreateFolderOpen(false)}
          onSubmit={handleCreateFolder}
        />

        <FolderNameModal
          visible={renameTarget !== null}
          title="Rename folder"
          initialName={renameTarget?.name || ''}
          okText="Save"
          loading={modalLoading}
          onCancel={() => setRenameTarget(null)}
          onSubmit={handleRenameFolder}
        />

        <MoveToFolderModal
          visible={moveFolderTarget !== null}
          title={`Move "${moveFolderTarget?.name}" to...`}
          allFolders={allFolders}
          disabledFolderIds={moveFolderDisabledIds}
          initialSelected={moveFolderTarget?.parentFolderId ?? null}
          loading={modalLoading}
          onCancel={() => setMoveFolderTarget(null)}
          onSubmit={handleMoveFolder}
        />

        <MoveToFolderModal
          visible={moveDocTarget !== null}
          title={`Move "${
            moveDocTarget?.originalFilename || moveDocTarget?.filename
          }" to...`}
          allFolders={allFolders}
          initialSelected={moveDocTarget?.folderId ?? null}
          loading={modalLoading}
          onCancel={() => setMoveDocTarget(null)}
          onSubmit={handleMoveDocument}
        />

        <DeleteFolderModal
          visible={deleteTarget !== null}
          folderName={deleteTarget?.name || ''}
          childFolderCount={deleteStats?.childFolderCount ?? 0}
          documentCount={deleteStats?.documentCount ?? 0}
          loading={modalLoading}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteStats(null);
          }}
          onSubmit={handleDeleteFolder}
        />
      </PageLayout>
    </SiderLayout>
  );
}
