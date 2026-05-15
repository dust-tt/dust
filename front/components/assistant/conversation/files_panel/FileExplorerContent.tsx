import {
  FileExplorerEmptyState,
  FileExplorerFileCard,
  FileExplorerFolderCard,
  type ViewMode,
} from "@app/components/assistant/conversation/files_panel/FileExplorerItem";
import type { SandboxTreeNode } from "@app/components/assistant/conversation/files_panel/types";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import { CardGrid, ScrollArea, Spinner } from "@dust-tt/sparkle";

const cardGridClasses =
  "grid-cols-2 @xxs:grid-cols-3 @sm:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6";

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

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-1 flex-col overflow-hidden gap-5">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : isEmpty ? (
          <FileExplorerEmptyState />
        ) : viewMode === "list" ? (
          <div className="flex flex-col gap-0.5">{items}</div>
        ) : (
          <CardGrid gridClassName={cardGridClasses}>{items}</CardGrid>
        )}
      </div>
    </ScrollArea>
  );
}
