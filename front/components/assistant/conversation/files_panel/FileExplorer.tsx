import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  FileExplorerEmptyState,
  FileExplorerFileCard,
  FileExplorerFolderCard,
  type ViewMode,
} from "@app/components/assistant/conversation/files_panel/FileExplorerItem";
import { FilePreviewDialog } from "@app/components/assistant/conversation/files_panel/FilePreviewDialog";
import { SandboxStatusChip } from "@app/components/assistant/conversation/files_panel/SandboxStatusChip";
import type { SandboxTreeNode } from "@app/components/assistant/conversation/files_panel/types";
import { buildSandboxTree } from "@app/components/assistant/conversation/files_panel/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxStatus } from "@app/hooks/conversations/useConversationSandboxStatus";
import { useSendNotification } from "@app/hooks/useNotification";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { downloadSandboxFile } from "@app/lib/swr/files";
import logger from "@app/logger/logger";
import type {
  GCSMountEntry,
  GCSMountFileEntry,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isInteractiveContentType } from "@app/types/files";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  type BreadcrumbItem,
  Breadcrumbs,
  Button,
  CardGrid,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListCheckIcon,
  ListIcon,
  ScrollArea,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useRef, useState } from "react";

const cardGridClasses =
  "grid-cols-2 @xxs:grid-cols-3 @sm:grid-cols-4 @md:grid-cols-5 @lg:grid-cols-6";

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
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

// TODO(2026-04-27 FILE SYSTEM): Candidate for Sparkle once the GCS file explorer pattern stabilises.
interface FileExplorerViewToggleProps {
  value: ViewMode;
  onValueChange: (v: ViewMode) => void;
}

function FileExplorerViewToggle({
  value,
  onValueChange,
}: FileExplorerViewToggleProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={value === "grid" ? ListIcon : ListCheckIcon}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem label="Grid" onClick={() => onValueChange("grid")} />
        <DropdownMenuItem label="List" onClick={() => onValueChange("list")} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  const sendNotification = useSendNotification();
  const [folderStack, setFolderStack] = useState<SandboxTreeNode[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewFile, setPreviewFile] = useState<GCSMountFileEntry | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const { sandboxStatus } = useConversationSandboxStatus({
    conversationId: conversation.sId,
    owner,
  });

  const tree = useMemo(() => buildSandboxTree(files), [files]);

  // Map from tree-relative path → original GCSMountFileEntry (for metadata).
  // Tree-relative path = entry.path with the use-case prefix (first segment) stripped.
  // Only file entries are indexed; directory entries are inferred from paths by buildSandboxTree.
  const entryByRelativePath = useMemo(() => {
    const map = new Map<string, GCSMountFileEntry>();
    for (const f of files) {
      if (f.isDirectory) {
        continue;
      }
      const slashIdx = f.path.indexOf("/");
      const relativePath = slashIdx >= 0 ? f.path.slice(slashIdx + 1) : f.path;
      map.set(relativePath, f);
    }
    return map;
  }, [files]);

  const currentNodes = useMemo(() => {
    if (folderStack.length === 0) {
      return tree;
    }
    return folderStack.at(-1)?.children ?? [];
  }, [tree, folderStack]);

  const { folders, filesAtLevel } = useMemo(() => {
    const folders: SandboxTreeNode[] = [];
    const filesAtLevel: GCSMountFileEntry[] = [];

    for (const node of currentNodes) {
      if (node.name.startsWith(".") && node.name !== TOOL_OUTPUTS_FOLDER_NAME) {
        continue;
      }
      if (node.isDirectory) {
        folders.push(node);
      } else {
        const entry = entryByRelativePath.get(node.path);
        if (entry) {
          filesAtLevel.push(entry);
        }
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    filesAtLevel.sort((a, b) => a.fileName.localeCompare(b.fileName));

    return { folders, filesAtLevel };
  }, [currentNodes, entryByRelativePath]);

  const totalFileCount = filesAtLevel.length;

  const handleBreadcrumbNavigate = (index: number) => {
    if (index < 0) {
      setFolderStack([]);
    } else {
      setFolderStack((prev) => prev.slice(0, index + 1));
    }
  };

  const handleFolderNavigate = (node: SandboxTreeNode) => {
    setFolderStack((prev) => [...prev, node]);
  };

  const handleOpen = (entry: GCSMountFileEntry) => {
    if (isInteractiveContentType(entry.contentType) && entry.fileId) {
      openPanel({ type: "interactive_content", fileId: entry.fileId });
    } else {
      setPreviewFile(entry);
      setShowPreviewSheet(true);
    }
  };

  const previewIndex = previewFile
    ? filesAtLevel.findIndex((f) => f.path === previewFile.path)
    : -1;

  const handlePreviewPrev = () => {
    if (previewIndex > 0) {
      setPreviewFile(filesAtLevel[previewIndex - 1] ?? null);
    }
  };

  const handlePreviewNext = () => {
    if (previewIndex >= 0 && previewIndex < filesAtLevel.length - 1) {
      setPreviewFile(filesAtLevel[previewIndex + 1] ?? null);
    }
  };

  const handleDownload = async (entry: GCSMountFileEntry) => {
    try {
      const res = await downloadSandboxFile(
        owner,
        conversation.sId,
        entry.path
      );
      const blob = await res.blob();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const a = document.createElement("a");
      a.href = url;
      a.download = entry.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      logger.error(
        { err: normalizeError(err) },
        "Failed to download sandbox file"
      );

      sendNotification({
        type: "error",
        title: "Failed to download the file.",
        description: "An error occurred while downloading. Please try again.",
      });
    }
  };

  const items = (
    <>
      {folders.map((node) => (
        <FileExplorerFolderCard
          key={node.path}
          node={node}
          viewMode={viewMode}
          onNavigate={handleFolderNavigate}
        />
      ))}
      {filesAtLevel.map((entry) => (
        <FileExplorerFileCard
          key={entry.path}
          entry={entry}
          viewMode={viewMode}
          onOpen={handleOpen}
          onDownload={handleDownload}
        />
      ))}
    </>
  );

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
              <FileExplorerViewToggle
                value={viewMode}
                onValueChange={setViewMode}
              />
              <Button
                variant="ghost"
                size="sm"
                icon={XMarkIcon}
                onClick={onClose}
              />
            </div>
          </div>
        </AppLayoutTitle>

        <div className="flex flex-1 flex-col overflow-hidden gap-5 pt-5 px-4">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner />
            </div>
          ) : totalFileCount === 0 && folders.length === 0 ? (
            <FileExplorerEmptyState />
          ) : (
            <ScrollArea className="flex-1">
              {viewMode === "list" ? (
                <div className="flex flex-col gap-0.5">{items}</div>
              ) : (
                <CardGrid gridClassName={cardGridClasses}>{items}</CardGrid>
              )}
            </ScrollArea>
          )}
        </div>
      </div>

      <FilePreviewDialog
        owner={owner}
        entry={previewFile}
        conversationId={conversation.sId}
        isOpen={showPreviewSheet}
        onOpenChange={setShowPreviewSheet}
        onDownload={handleDownload}
        onPrev={previewIndex > 0 ? handlePreviewPrev : undefined}
        onNext={
          previewIndex >= 0 && previewIndex < filesAtLevel.length - 1
            ? handlePreviewNext
            : undefined
        }
      />
    </>
  );
}
