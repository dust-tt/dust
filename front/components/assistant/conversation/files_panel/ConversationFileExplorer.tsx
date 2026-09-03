import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConfirmContext } from "@app/components/Confirm";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type { RenameMountItem } from "@app/components/file_explorer/RenameFileDialog";
import { RenameFileDialog } from "@app/components/file_explorer/RenameFileDialog";
import type {
  FileEntry,
  FileExplorerEntry,
  FileExplorerPathEntry,
  FolderEntry,
  FramePackageEntry,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import {
  getParentFolderRelativePath,
  withVirtualExplorerPath,
} from "@app/components/file_explorer/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useFolderPathUrlState } from "@app/hooks/useFolderPathUrlState";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  downloadFile,
  getFilePathViewUrl,
  useDeleteFileByPath,
} from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import { opensInSidePanel } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, XClose } from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useState } from "react";

const POD_CONVERSATION_SCOPE_ROOTS = ["conversation", "pod"] as const;

function isFramePackageEntry(entry: FileExplorerEntry): boolean {
  return entry.kind === "frame_package";
}

interface ConversationFileExplorerProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationFileExplorer({
  conversation,
  owner,
}: ConversationFileExplorerProps) {
  const { closePanel, openPanel } = useConversationSidePanelContext();
  const { hasFeature } = useFeatureFlags();
  const confirm = useContext(ConfirmContext);
  const isPod = isPodConversation(conversation);

  const [currentFolderPath, setCurrentFolderPath] = useFolderPathUrlState();
  const [frameToRename, setFrameToRename] = useState<RenameMountItem | null>(
    null
  );

  const { sandboxFiles, isSandboxFilesLoading, mutateSandboxFiles } =
    useConversationSandboxFiles({
      conversationId: conversation.sId,
      owner,
    });

  const deleteFileByPath = useDeleteFileByPath({ owner });

  const {
    files: podFiles,
    isPodFilesLoading,
    mutatePodFiles,
  } = usePodFiles({
    owner,
    podId: isPod ? conversation.spaceId : "",
    disabled: !isPod,
  });

  const files = useMemo((): FileExplorerPathEntry[] => {
    if (!isPod) {
      return sandboxFiles;
    }

    return [
      ...sandboxFiles.map((f) => withVirtualExplorerPath(f, "conversation")),
      ...podFiles.map((f) => withVirtualExplorerPath(f, "pod")),
    ];
  }, [isPod, podFiles, sandboxFiles]);

  const getFileUrl = useCallback(
    (path: string) => getFilePathViewUrl(owner, path),
    [owner]
  );

  const getFileResponse = useCallback(
    (path: string) => downloadFile(owner, path),
    [owner]
  );

  const onFileDownload = useFileDownload({ getFileResponse });

  const onOpenInteractive = useCallback(
    (entry: { fileId: string }) =>
      openPanel({ type: "interactive_content", fileId: entry.fileId }),
    [openPanel]
  );

  const onOpenInPanel = useCallback(
    (entry: FileEntry): boolean => {
      if (opensInSidePanel(entry.contentType)) {
        openPanel({ type: "file_preview", filePath: entry.path });
        return true;
      }
      return false;
    },
    [openPanel]
  );

  // Only Frame packages get a Delete item here (see `canDelete`); other conversation files stay
  // non-deletable as before.
  const onDelete = useCallback(
    async (entry: FileExplorerEntry) => {
      if (entry.kind !== "frame_package") {
        return;
      }
      const confirmed = await confirm({
        title: "Delete Frame?",
        message:
          `Are you sure you want to delete the Frame "${entry.fileName}"? Its source, ` +
          "functions, databases and share links will be permanently removed. " +
          "This action cannot be undone.",
        validateLabel: "Delete",
        validateVariant: "warning",
      });
      if (confirmed) {
        // The package entry carries the manifest path; deleting the manifest runs the
        // package-aware Frame deletion server-side.
        const result = await deleteFileByPath(entry.path);
        if (result.isOk()) {
          await Promise.all([mutateSandboxFiles(), mutatePodFiles()]);
        }
      }
    },
    [confirm, deleteFileByPath, mutatePodFiles, mutateSandboxFiles]
  );

  // Only Frame packages get a Rename item here (see `canRename`), matching Delete.
  const onRename = useCallback(
    (entry: FileEntry | FolderEntry | FramePackageEntry) => {
      if (entry.kind !== "frame_package") {
        return;
      }
      // The package entry carries the manifest path; the Frame is renamed through its source
      // folder, which the server moves as a whole.
      setFrameToRename({
        kind: "frame",
        path: getParentFolderRelativePath(entry.path),
        name: entry.fileName,
      });
    },
    []
  );

  const onFrameRenamed = useCallback(() => {
    void Promise.all([mutateSandboxFiles(), mutatePodFiles()]);
  }, [mutatePodFiles, mutateSandboxFiles]);

  return (
    <div className="flex h-panel min-h-0 flex-col">
      <AppLayoutTitle>
        <div className="flex h-full items-center justify-between gap-2">
          <span className="text-sm text-foreground">
            {isPod ? "Files" : "Conversation files"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={XClose}
            onClick={closePanel}
          />
        </div>
      </AppLayoutTitle>

      <div className="flex min-h-0 flex-1 flex-col">
        <FileExplorer
          currentFolderPath={currentFolderPath}
          defaultViewMode={isPod ? "list" : "grid"}
          displayFramePackages={hasFeature("frames_v2")}
          files={files}
          hideBreadcrumbAtRoot={!isPod}
          isLoading={
            isPod
              ? isSandboxFilesLoading || isPodFilesLoading
              : isSandboxFilesLoading
          }
          getFileUrl={getFileUrl}
          onCurrentFolderChange={setCurrentFolderPath}
          onDelete={hasFeature("frames_v2") ? onDelete : undefined}
          canDelete={isFramePackageEntry}
          onRename={hasFeature("frames_v2") ? onRename : undefined}
          canRename={isFramePackageEntry}
          onFileDownload={onFileDownload}
          onOpenInteractive={onOpenInteractive}
          onOpenInPanel={onOpenInPanel}
          owner={owner}
          virtualScopeRoots={isPod ? POD_CONVERSATION_SCOPE_ROOTS : undefined}
        />
      </div>

      <RenameFileDialog
        isOpen={frameToRename !== null}
        onClose={() => setFrameToRename(null)}
        onRenamed={onFrameRenamed}
        owner={owner}
        item={frameToRename}
      />
    </div>
  );
}
