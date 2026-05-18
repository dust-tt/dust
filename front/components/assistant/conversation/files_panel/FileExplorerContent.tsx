import {
  FileExplorerEmptyState,
  FileExplorerFileCard,
  FileExplorerFolderCard,
  fileExplorerCardGridClasses,
  type ViewMode,
} from "@app/components/assistant/conversation/files_panel/FileExplorerItem";
import type { SandboxTreeNode } from "@app/components/assistant/conversation/files_panel/types";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import { CardGrid, ScrollArea, Spinner } from "@dust-tt/sparkle";

interface FileExplorerContentProps {
  isLoading: boolean;
  sortedNodes: SandboxTreeNode[];
  entryByRelativePath: Map<string, GCSMountFileEntry>;
  viewMode: ViewMode;
  isEmpty: boolean;
  onFolderNavigate: (node: SandboxTreeNode) => void;
  onFileOpen: (entry: GCSMountFileEntry) => void;
  onFileDownload: (entry: GCSMountFileEntry) => Promise<void>;
}

export function FileExplorerContent({
  isLoading,
  sortedNodes,
  entryByRelativePath,
  viewMode,
  isEmpty,
  onFolderNavigate,
  onFileOpen,
  onFileDownload,
}: FileExplorerContentProps) {
  const items = sortedNodes.map((node) => {
    if (node.isDirectory) {
      return (
        <FileExplorerFolderCard
          key={`dir:${node.path}`}
          node={node}
          viewMode={viewMode}
          onNavigate={onFolderNavigate}
        />
      );
    }

    const entry = entryByRelativePath.get(node.path);
    if (!entry) {
      return null;
    }

    return (
      <FileExplorerFileCard
        key={`file:${entry.path}`}
        entry={entry}
        viewMode={viewMode}
        onOpen={onFileOpen}
        onDownload={onFileDownload}
      />
    );
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
        <FileExplorerEmptyState />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-5 px-4">
        {viewMode === "list" ? (
          <div className="flex flex-col gap-0.5">{items}</div>
        ) : (
          <CardGrid gridClassName={fileExplorerCardGridClasses}>
            {items}
          </CardGrid>
        )}
      </div>
    </ScrollArea>
  );
}
