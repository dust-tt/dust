import { FileExplorerContent } from "@app/components/file_explorer/FileExplorerContent";
import { FileExplorerFilters } from "@app/components/file_explorer/FileExplorerFilters";
import type { ViewMode } from "@app/components/file_explorer/FileExplorerItem";
import { FileExplorerToolbar } from "@app/components/file_explorer/FileExplorerToolbar";
import { FilePreviewDialog } from "@app/components/file_explorer/FilePreviewDialog";
import { canMoveFileToParentFolder } from "@app/components/file_explorer/fileExplorerDragDrop";
import { getFileExplorerPipeline } from "@app/components/file_explorer/fileExplorerPipeline";
import { MoveFileToFolderDialog } from "@app/components/file_explorer/MoveFileToFolderDialog";
import type {
  ContentNodeEntry,
  FileEntry,
  FileEntryWithId,
  FileExplorerEntry,
  FileExplorerFilter,
  FileExplorerMenuAction,
  FileExplorerSortMode,
  SandboxTreeNode,
} from "@app/components/file_explorer/types";
import {
  buildFolderTree,
  countFoldersInTree,
  getFolderBreadcrumbSegments,
  getParentFolderRelativePath,
  getScopedRelativePath,
} from "@app/components/file_explorer/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import type { GCSMountEntry } from "@app/lib/api/files/gcs_mount/files";
import { isInteractiveContentType } from "@app/types/files";
import { Err, type Result } from "@app/types/shared/result";
import {
  type BreadcrumbItem,
  Breadcrumbs,
  Button,
  cn,
  FolderOpenIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface FileExplorerBreadcrumbProps {
  currentFolderPath: string;
  onNavigate: (index: number) => void;
}

function FileExplorerBreadcrumb({
  currentFolderPath,
  onNavigate,
}: FileExplorerBreadcrumbProps) {
  const segments = getFolderBreadcrumbSegments(currentFolderPath);
  const items: BreadcrumbItem[] = [
    { label: "All files", onClick: () => onNavigate(-1) },
    ...segments.map((segment, i) => ({
      label: segment.label,
      onClick: () => onNavigate(i),
    })),
  ];

  return <Breadcrumbs items={items} size="sm" />;
}

interface FileExplorerProps {
  contentClassName?: string;
  contentNodes?: ContentNodeEntry[];
  defaultViewMode?: ViewMode;
  emptyState?: React.ReactNode;
  hideTitleBorder?: boolean;
  files: GCSMountEntry[];
  getFileUrl: (path: string) => string;
  headerActions?: React.ReactNode;
  isLoading: boolean;
  navigationResetKey?: number;
  onClose?: () => void;
  onCurrentFolderChange?: (relativePath: string) => void;
  onDelete?: (entry: FileExplorerEntry) => Promise<void>;
  onFileDownload: (entry: FileEntry) => Promise<void>;
  onMoveFile?: (
    entry: FileEntry,
    parentRelativePath: string
  ) => Promise<Result<void, Error>>;
  onOpenInteractive?: (entry: FileEntryWithId) => void;
  onRename?: (entry: FileEntry) => void;
}

export function FileExplorer({
  contentClassName,
  contentNodes = [],
  defaultViewMode = "grid",
  emptyState,
  files,
  getFileUrl,
  headerActions,
  hideTitleBorder = false,
  isLoading,
  navigationResetKey,
  onClose,
  onCurrentFolderChange,
  onDelete,
  onFileDownload,
  onMoveFile,
  onOpenInteractive,
  onRename,
}: FileExplorerProps) {
  const [currentFolderPath, setCurrentFolderPath] = useState("");
  const prevNavigationResetKey = useRef(navigationResetKey);

  useEffect(() => {
    onCurrentFolderChange?.(currentFolderPath);
  }, [currentFolderPath, onCurrentFolderChange]);

  useEffect(() => {
    if (
      navigationResetKey !== undefined &&
      prevNavigationResetKey.current !== navigationResetKey
    ) {
      setCurrentFolderPath("");
    }
    prevNavigationResetKey.current = navigationResetKey;
  }, [navigationResetKey]);

  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FileExplorerFilter>("all");
  const [sortMode, setSortMode] =
    useState<FileExplorerSortMode>("last-modified");
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const [fileToMove, setFileToMove] = useState<FileEntry | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

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
        currentFolderPath,
        files,
        searchQuery,
        activeFilter,
        sortMode,
      }),
    [
      contentNodes,
      currentFolderPath,
      files,
      searchQuery,
      activeFilter,
      sortMode,
    ]
  );

  const folderTree = useMemo(() => buildFolderTree(files), [files]);
  const totalFolderCount = useMemo(
    () => countFoldersInTree(folderTree),
    [folderTree]
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
      if (onMoveFile && totalFolderCount > 0 && entry.kind === "file") {
        items.push({
          label: "Move to…",
          icon: FolderOpenIcon,
          onClick: (e) => {
            e.stopPropagation();
            setFileToMove(entry);
            setShowMoveDialog(true);
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
    [onDelete, onMoveFile, onRename, totalFolderCount]
  );

  const handleMoveToFolder = useCallback(
    async (parentRelativePath: string) => {
      if (!fileToMove || !onMoveFile) {
        return new Err(new Error("No file selected to move."));
      }
      return onMoveFile(fileToMove, parentRelativePath);
    },
    [fileToMove, onMoveFile]
  );

  const handleBreadcrumbNavigate = (index: number) => {
    if (index < 0) {
      setCurrentFolderPath("");
      return;
    }

    const segments = getFolderBreadcrumbSegments(currentFolderPath);
    setCurrentFolderPath(segments[index]?.path ?? "");
  };

  const handleFolderNavigate = (node: SandboxTreeNode) => {
    setCurrentFolderPath(node.path);
  };

  const handleGoUp = () => {
    setCurrentFolderPath(getParentFolderRelativePath(currentFolderPath));
  };

  const parentFolderPath = getParentFolderRelativePath(currentFolderPath);
  const parentFolderLabel = parentFolderPath
    ? (parentFolderPath.split("/").at(-1) ?? "All files")
    : "All files";

  const fileDragEnabled = Boolean(onMoveFile && totalFolderCount > 0);

  const handleMoveFileDrop = useCallback(
    async (scopedFilePath: string, parentRelativePath: string) => {
      if (
        !onMoveFile ||
        !canMoveFileToParentFolder(scopedFilePath, parentRelativePath)
      ) {
        return;
      }

      const relativePath = getScopedRelativePath(scopedFilePath);
      const entry = entryByRelativePath.get(relativePath);
      if (entry?.kind !== "file") {
        return;
      }

      await onMoveFile(entry, parentRelativePath);
    },
    [entryByRelativePath, onMoveFile]
  );

  const handleFileOpen = (entry: FileEntry) => {
    if (
      onOpenInteractive &&
      isInteractiveContentType(entry.contentType) &&
      entry.fileId
    ) {
      onOpenInteractive({ ...entry, fileId: entry.fileId });
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
        <AppLayoutTitle className={hideTitleBorder ? "border-b-0" : undefined}>
          <div
            className={cn(
              "flex h-full items-center justify-between gap-2 px-4",
              contentClassName
            )}
          >
            <FileExplorerBreadcrumb
              currentFolderPath={currentFolderPath}
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
        <div
          className={cn(
            "flex flex-1 min-h-0 flex-col gap-5 pt-5",
            contentClassName
          )}
        >
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
            fileDragEnabled={fileDragEnabled}
            parentFolderDropPath={parentFolderPath}
            parentFolderLabel={
              currentFolderPath ? parentFolderLabel : undefined
            }
            onGoUp={currentFolderPath ? handleGoUp : undefined}
            onFolderNavigate={handleFolderNavigate}
            onFileOpen={handleFileOpen}
            onFileDownload={onFileDownload}
            onMoveFileDrop={fileDragEnabled ? handleMoveFileDrop : undefined}
            onNodeOpen={handleNodeOpen}
            getFileMenuItems={
              onDelete || onRename || onMoveFile ? getMenuItems : undefined
            }
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

      {onMoveFile && (
        <MoveFileToFolderDialog
          files={files}
          file={fileToMove}
          isOpen={showMoveDialog}
          onClose={() => setShowMoveDialog(false)}
          onMove={handleMoveToFolder}
        />
      )}
    </>
  );
}
