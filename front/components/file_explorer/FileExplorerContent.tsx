import {
  ContentNodeCard,
  FileExplorerEmptyState,
  FileExplorerFileCard,
  FileExplorerFolderCard,
  FileExplorerGoUpCard,
  type ViewMode,
} from "@app/components/file_explorer/FileExplorerItem";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerEntry,
  FileExplorerMenuAction,
  SandboxTreeNode,
} from "@app/components/file_explorer/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { CardGrid, ScrollArea, Spinner } from "@dust-tt/sparkle";
import type React from "react";

const cardGridClasses =
  "grid-cols-2 @xxs:grid-cols-3 @sm:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6";

interface FileExplorerContentProps {
  isLoading: boolean;
  sortedNodes: SandboxTreeNode[];
  entryByRelativePath: Map<string, FileExplorerEntry>;
  viewMode: ViewMode;
  isEmpty: boolean;
  emptyState?: React.ReactNode;
  fileDragEnabled?: boolean;
  parentFolderDropPath?: string;
  parentFolderLabel?: string;
  onGoUp?: () => void;
  onFolderNavigate: (node: SandboxTreeNode) => void;
  onFileOpen: (entry: FileEntry) => void;
  onFileDownload: (entry: FileEntry) => Promise<void>;
  onMoveFileDrop?: (scopedFilePath: string, parentRelativePath: string) => void;
  onNodeOpen: (entry: ContentNodeEntry) => void;
  getFileMenuItems?: (entry: FileExplorerEntry) => FileExplorerMenuAction[];
}

export function FileExplorerContent({
  isLoading,
  sortedNodes,
  entryByRelativePath,
  viewMode,
  isEmpty,
  emptyState,
  fileDragEnabled,
  parentFolderDropPath,
  parentFolderLabel,
  onGoUp,
  onFolderNavigate,
  onFileOpen,
  onFileDownload,
  onMoveFileDrop,
  onNodeOpen,
  getFileMenuItems,
}: FileExplorerContentProps) {
  const canGoUp = Boolean(onGoUp && parentFolderLabel);

  const goUpItem =
    canGoUp && parentFolderLabel && onGoUp ? (
      <FileExplorerGoUpCard
        key="go-up"
        parentLabel={parentFolderLabel}
        parentRelativePath={parentFolderDropPath ?? ""}
        viewMode={viewMode}
        onGoUp={onGoUp}
        onMoveFileDrop={onMoveFileDrop}
      />
    ) : null;

  const items = sortedNodes.map((node) => {
    if (node.isDirectory) {
      return (
        <FileExplorerFolderCard
          key={`dir:${node.path}`}
          node={node}
          viewMode={viewMode}
          onNavigate={onFolderNavigate}
          onMoveFileDrop={onMoveFileDrop}
        />
      );
    }

    const entry = entryByRelativePath.get(node.path);
    if (!entry) {
      return null;
    }

    switch (entry.kind) {
      case "node":
        return (
          <ContentNodeCard
            key={`node:${entry.path}`}
            entry={entry}
            viewMode={viewMode}
            onOpen={onNodeOpen}
            extraMenuItems={getFileMenuItems?.(entry)}
          />
        );

      case "file":
        return (
          <FileExplorerFileCard
            key={`file:${entry.path}`}
            draggable={fileDragEnabled}
            entry={entry}
            viewMode={viewMode}
            onOpen={onFileOpen}
            onDownload={onFileDownload}
            extraMenuItems={getFileMenuItems?.(entry)}
          />
        );

      default:
        assertNeverAndIgnore(entry);
        return null;
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Spinner />
      </div>
    );
  }

  if (isEmpty && !canGoUp) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        {emptyState ?? <FileExplorerEmptyState />}
      </div>
    );
  }

  if (isEmpty && canGoUp) {
    return (
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 px-4">
          {viewMode === "list" ? (
            <div className="flex flex-col gap-0.5">{goUpItem}</div>
          ) : (
            <CardGrid gridClassName={cardGridClasses}>{goUpItem}</CardGrid>
          )}
          <div className="flex flex-1 items-center justify-center py-8">
            {emptyState ?? <FileExplorerEmptyState />}
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-5 px-4">
        {viewMode === "list" ? (
          <div className="flex flex-col gap-0.5">
            {goUpItem}
            {items}
          </div>
        ) : (
          <CardGrid gridClassName={cardGridClasses}>
            {goUpItem}
            {items}
          </CardGrid>
        )}
      </div>
    </ScrollArea>
  );
}
