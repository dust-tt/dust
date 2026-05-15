import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorerContent } from "@app/components/assistant/conversation/files_panel/FileExplorerContent";
import { FileExplorerFilters } from "@app/components/assistant/conversation/files_panel/FileExplorerFilters";
import type { ViewMode } from "@app/components/assistant/conversation/files_panel/FileExplorerItem";
import { FileExplorerToolbar } from "@app/components/assistant/conversation/files_panel/FileExplorerToolbar";
import { FilePreviewDialog } from "@app/components/assistant/conversation/files_panel/FilePreviewDialog";
import { SandboxStatusChip } from "@app/components/assistant/conversation/files_panel/SandboxStatusChip";
import type {
  FileExplorerFilter,
  FileExplorerSortMode,
  SandboxTreeNode,
} from "@app/components/assistant/conversation/files_panel/types";
import { useFileDownload } from "@app/components/assistant/conversation/files_panel/useFileDownload";
import { useFileExplorerPipeline } from "@app/components/assistant/conversation/files_panel/useFileExplorerPipeline";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxStatus } from "@app/hooks/conversations/useConversationSandboxStatus";
import type {
  GCSMountEntry,
  GCSMountFileEntry,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isInteractiveContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  type BreadcrumbItem,
  Breadcrumbs,
  Button,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

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

interface NewFileExplorerProps {
  conversation: ConversationWithoutContentType;
  files: GCSMountEntry[];
  isLoading: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function NewFileExplorer({
  conversation,
  files,
  isLoading,
  onClose,
  owner,
}: NewFileExplorerProps) {
  const { openPanel } = useConversationSidePanelContext();
  const { sandboxStatus } = useConversationSandboxStatus({
    conversationId: conversation.sId,
    owner,
  });

  const [folderStack, setFolderStack] = useState<SandboxTreeNode[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FileExplorerFilter>("all");
  const [sortMode, setSortMode] =
    useState<FileExplorerSortMode>("last-modified");
  const [previewFile, setPreviewFile] = useState<GCSMountFileEntry | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);

  const {
    sortedNodes,
    filterCounts,
    folderCount,
    fileCount,
    filesAtLevel,
    entryByRelativePath,
  } = useFileExplorerPipeline({
    files,
    folderStack,
    searchQuery,
    activeFilter,
    sortMode,
  });

  const handleFileDownload = useFileDownload({
    owner,
    conversationId: conversation.sId,
  });

  const handleBreadcrumbNavigate = (index: number) => {
    setFolderStack((prev) => (index < 0 ? [] : prev.slice(0, index + 1)));
  };

  const handleFolderNavigate = (node: SandboxTreeNode) => {
    setFolderStack((prev) => [...prev, node]);
  };

  const handleFileOpen = (entry: GCSMountFileEntry) => {
    if (isInteractiveContentType(entry.contentType) && entry.fileId) {
      openPanel({ type: "interactive_content", fileId: entry.fileId });
      return;
    }
    setPreviewFile(entry);
    setShowPreviewSheet(true);
  };

  const previewIndex = previewFile
    ? filesAtLevel.findIndex((f) => f.path === previewFile.path)
    : -1;
  const handlePreviewPrev =
    previewIndex > 0
      ? () => setPreviewFile(filesAtLevel[previewIndex - 1] ?? null)
      : undefined;
  const handlePreviewNext =
    previewIndex >= 0 && previewIndex < filesAtLevel.length - 1
      ? () => setPreviewFile(filesAtLevel[previewIndex + 1] ?? null)
      : undefined;

  return (
    <>
      <div className="flex h-full flex-col">
        <AppLayoutTitle>
          <div className="flex h-full items-center justify-between gap-2">
            <FileExplorerBreadcrumb
              folderStack={folderStack}
              onNavigate={handleBreadcrumbNavigate}
            />
            <div className="flex items-center gap-2">
              {sandboxStatus && <SandboxStatusChip status={sandboxStatus} />}
              <Button
                variant="ghost"
                size="sm"
                icon={XMarkIcon}
                onClick={onClose}
              />
            </div>
          </div>
        </AppLayoutTitle>
        <div className="flex flex-col gap-5 pt-5 px-4">
          <FileExplorerToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
          />
          <FileExplorerFilters
            active={activeFilter}
            onActiveChange={setActiveFilter}
            counts={filterCounts}
          />
          <FileExplorerContent
            isLoading={isLoading}
            sortedNodes={sortedNodes}
            entryByRelativePath={entryByRelativePath}
            viewMode={viewMode}
            isEmpty={fileCount === 0 && folderCount === 0}
            onFolderNavigate={handleFolderNavigate}
            onFileOpen={handleFileOpen}
            onFileDownload={handleFileDownload}
          />
        </div>
      </div>

      <FilePreviewDialog
        owner={owner}
        entry={previewFile}
        conversationId={conversation.sId}
        isOpen={showPreviewSheet}
        onOpenChange={setShowPreviewSheet}
        onDownload={handleFileDownload}
        onPrev={handlePreviewPrev}
        onNext={handlePreviewNext}
      />
    </>
  );
}
