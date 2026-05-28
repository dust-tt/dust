import {
  ContentNodeCard,
  FileExplorerEmptyState,
  FileExplorerFileCard,
  FileExplorerFolderCard,
  type ViewMode,
} from "@app/components/file_explorer/FileExplorerItem";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerEntry,
  FileExplorerMenuAction,
  FileSystemTreeNode,
  FolderEntry,
} from "@app/components/file_explorer/types";
import { isFileExplorerMovableFile } from "@app/components/file_explorer/utils";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { CardGrid, ScrollArea, Spinner } from "@dust-tt/sparkle";
import type React from "react";

const cardGridClasses =
  "grid-cols-2 @xxs:grid-cols-3 @sm:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6";

interface FileExplorerContentProps {
  isLoading: boolean;
  sortedNodes: FileSystemTreeNode[];
  entryByRelativePath: Map<string, FileExplorerEntry>;
  viewMode: ViewMode;
  isEmpty: boolean;
  emptyState?: React.ReactNode;
  fileDragEnabled?: boolean;
  onFolderNavigate: (node: FileSystemTreeNode) => void;
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
  onFolderNavigate,
  onFileOpen,
  onFileDownload,
  onMoveFileDrop,
  onNodeOpen,
  getFileMenuItems,
}: FileExplorerContentProps) {
  const items = sortedNodes.map((node) => {
    if (node.isDirectory) {
      const folderEntry: FolderEntry = {
        kind: "folder",
        path: `pod/${node.path}`,
        name: node.name,
      };
      return (
        <FileExplorerFolderCard
          key={`dir:${node.path}`}
          node={node}
          viewMode={viewMode}
          onNavigate={onFolderNavigate}
          onMoveFileDrop={onMoveFileDrop}
          extraMenuItems={getFileMenuItems?.(folderEntry)}
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
            draggable={fileDragEnabled && isFileExplorerMovableFile(entry)}
            entry={entry}
            viewMode={viewMode}
            onOpen={onFileOpen}
            onDownload={onFileDownload}
            extraMenuItems={getFileMenuItems?.(entry)}
          />
        );

      case "folder":
        return null;

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

  if (isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        {emptyState ?? <FileExplorerEmptyState />}
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-5 px-4">
        {viewMode === "list" ? (
          <div className="flex flex-col gap-0.5">{items}</div>
        ) : (
          <CardGrid gridClassName={cardGridClasses}>{items}</CardGrid>
        )}
      </div>
    </ScrollArea>
  );
}
