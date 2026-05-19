import { FileExplorerContent } from "@app/components/file_explorer/FileExplorerContent";
import { FileExplorerFilters } from "@app/components/file_explorer/FileExplorerFilters";
import type { ViewMode } from "@app/components/file_explorer/FileExplorerItem";
import { FileExplorerToolbar } from "@app/components/file_explorer/FileExplorerToolbar";
import { FilePreviewDialog } from "@app/components/file_explorer/FilePreviewDialog";
import { getFileExplorerPipeline } from "@app/components/file_explorer/fileExplorerPipeline";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerEntry,
  FileExplorerFilter,
  FileExplorerMenuAction,
  FileExplorerSortMode,
  SandboxTreeNode,
} from "@app/components/file_explorer/types";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import type { GCSMountEntry } from "@app/lib/api/files/gcs_mount/files";
import { isInteractiveContentType } from "@app/types/files";
import {
  type BreadcrumbItem,
  Breadcrumbs,
  Button,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useMemo, useState } from "react";

interface FileExplorerBreadcrumbProps {
  folderStack: SandboxTreeNode[];
  onNavigate: (index: number) => void;
}

function FileExplorerBreadcrumb({
  folderStack,
  onNavigate,
}: FileExplorerBreadcrumbProps) {
  const items: BreadcrumbItem[] = [
    { label: "All files", onClick: () => onNavigate(-1) },
    ...folderStack.map((node, i) => ({
      label: node.name,
      onClick: () => onNavigate(i),
    })),
  ];

  return <Breadcrumbs items={items} size="sm" />;
}

interface FileExplorerProps {
  contentNodes?: ContentNodeEntry[];
  emptyState?: React.ReactNode;
  files: GCSMountEntry[];
  getFileUrl: (path: string) => string;
  headerActions?: React.ReactNode;
  isLoading: boolean;
  onClose?: () => void;
  onDelete?: (entry: FileExplorerEntry) => Promise<void>;
  onFileDownload: (entry: FileEntry) => Promise<void>;
  onOpenInteractive?: (fileId: string) => void;
  onRename?: (entry: FileEntry) => void;
}

export function FileExplorer({
  contentNodes = [],
  emptyState,
  files,
  getFileUrl,
  headerActions,
  isLoading,
  onClose,
  onDelete,
  onFileDownload,
  onOpenInteractive,
  onRename,
}: FileExplorerProps) {
  const [folderStack, setFolderStack] = useState<SandboxTreeNode[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FileExplorerFilter>("all");
  const [sortMode, setSortMode] =
    useState<FileExplorerSortMode>("last-modified");
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);

  const {
    sortedNodes,
    filterCounts,
    folderCount,
    fileCount,
    filesAtLevel,
    entryByRelativePath,
  } = useMemo(
    () =>
      getFileExplorerPipeline({
        contentNodes,
        files,
        folderStack,
        searchQuery,
        activeFilter,
        sortMode,
      }),
    [contentNodes, files, folderStack, searchQuery, activeFilter, sortMode]
  );

  const getMenuItems = useCallback(
    (entry: FileExplorerEntry): FileExplorerMenuAction[] => {
      const items: FileExplorerMenuAction[] = [];
      if (onRename && entry.kind === "file") {
        items.push({
          label: "Rename",
          icon: PencilSquareIcon,
          onClick: (e) => {
            e.stopPropagation();
            onRename(entry);
          },
        });
      }
      if (onDelete) {
        items.push({
          label: entry.kind === "node" ? "Remove" : "Delete",
          icon: TrashIcon,
          variant: "warning",
          onClick: (e) => {
            e.stopPropagation();
            void onDelete(entry);
          },
        });
      }
      return items;
    },
    [onDelete, onRename]
  );

  const handleBreadcrumbNavigate = (index: number) => {
    setFolderStack((prev) => (index < 0 ? [] : prev.slice(0, index + 1)));
  };

  const handleFolderNavigate = (node: SandboxTreeNode) => {
    setFolderStack((prev) => [...prev, node]);
  };

  const handleFileOpen = (entry: FileEntry) => {
    if (
      onOpenInteractive &&
      isInteractiveContentType(entry.contentType) &&
      entry.fileId
    ) {
      onOpenInteractive(entry.fileId);
      return;
    }
    setPreviewFile(entry);
    setShowPreviewSheet(true);
  };

  const handleNodeOpen = (entry: ContentNodeEntry) => {
    if (entry.sourceUrl) {
      window.open(entry.sourceUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Only file entries participate in prev/next navigation.
  const fileEntriesAtLevel = filesAtLevel.filter(
    (e): e is FileEntry => e.kind === "file"
  );
  const previewIndex = previewFile
    ? fileEntriesAtLevel.findIndex((f) => f.path === previewFile.path)
    : -1;
  const handlePreviewPrev =
    previewIndex > 0
      ? () => setPreviewFile(fileEntriesAtLevel[previewIndex - 1] ?? null)
      : undefined;
  const handlePreviewNext =
    previewIndex >= 0 && previewIndex < fileEntriesAtLevel.length - 1
      ? () => setPreviewFile(fileEntriesAtLevel[previewIndex + 1] ?? null)
      : undefined;

  return (
    <>
      <div className="flex h-full w-full min-h-0 flex-1 flex-col">
        <AppLayoutTitle>
          <div className="flex h-full items-center justify-between gap-2">
            <FileExplorerBreadcrumb
              folderStack={folderStack}
              onNavigate={handleBreadcrumbNavigate}
            />
            <div className="flex items-center gap-2">
              {headerActions}
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={XMarkIcon}
                  onClick={onClose}
                />
              )}
            </div>
          </div>
        </AppLayoutTitle>
        <div className="flex flex-1 min-h-0 flex-col gap-5 pt-5 max-w-4xl mx-auto w-full">
          <div className="px-4">
            <FileExplorerToolbar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
            />
          </div>
          <div className="px-4">
            <FileExplorerFilters
              active={activeFilter}
              onActiveChange={setActiveFilter}
              counts={filterCounts}
            />
          </div>
          <FileExplorerContent
            isLoading={isLoading}
            sortedNodes={sortedNodes}
            entryByRelativePath={entryByRelativePath}
            viewMode={viewMode}
            isEmpty={fileCount === 0 && folderCount === 0}
            emptyState={emptyState}
            onFolderNavigate={handleFolderNavigate}
            onFileOpen={handleFileOpen}
            onFileDownload={onFileDownload}
            onNodeOpen={handleNodeOpen}
            getFileMenuItems={onDelete || onRename ? getMenuItems : undefined}
          />
        </div>
      </div>

      <FilePreviewDialog
        entry={previewFile}
        getFileUrl={getFileUrl}
        isOpen={showPreviewSheet}
        onOpenChange={setShowPreviewSheet}
        onDownload={onFileDownload}
        onPrev={handlePreviewPrev}
        onNext={handlePreviewNext}
      />
    </>
  );
}
