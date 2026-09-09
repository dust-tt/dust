import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConfirmContext } from "@app/components/Confirm";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type {
  FileEntry,
  FileExplorerEntry,
  FileExplorerMenuAction,
  FileExplorerPathEntry,
  FileExplorerVirtualScopeRoot,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { withVirtualExplorerPath } from "@app/components/file_explorer/utils";
import { EditPodFileTabDialog } from "@app/components/pod/files/EditPodFileTabDialog";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useFolderPathUrlState } from "@app/hooks/useFolderPathUrlState";
import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import { usePodFileTabs } from "@app/hooks/usePodFileTabs";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  downloadFile,
  getFilePathViewUrl,
  useDeleteFileByPath,
} from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import { opensInSidePanel } from "@app/types/files";
import type { PodFileTab } from "@app/types/pod_file_tab";
import {
  DEFAULT_POD_FILE_TAB_ICON,
  MAX_POD_FILE_TAB_TITLE_LENGTH,
  podFileTabBasename,
} from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, LayoutAlt02, Pin02, XClose } from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useState } from "react";

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

  const virtualScopeRoots = useMemo<
    readonly FileExplorerVirtualScopeRoot[] | undefined
  >(() => {
    if (!isPod) {
      return undefined;
    }

    return [
      {
        path: "conversation",
        canonicalPath: `conversation-${conversation.sId}`,
      },
      { path: "pod", canonicalPath: `pod-${conversation.spaceId}` },
    ];
  }, [conversation, isPod]);

  const [currentFolderPath, setCurrentFolderPath] = useFolderPathUrlState();

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

  const { spaceInfo: podInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: isPod ? conversation.spaceId : null,
  });

  const canEditPod =
    isPod && (podInfo?.isEditor ?? false) && !podInfo?.archivedAt;

  const { togglePin, isPinned } = usePinPodBanner({
    owner,
    podId: isPod ? conversation.spaceId : "",
    pinnedFramePath: podInfo?.pinnedFramePath ?? null,
    isEditor: canEditPod,
  });

  const hasFileTabs = hasFeature("pod_frame_tabs");

  const { removeFileTab, isFileTab } = usePodFileTabs({
    owner,
    podId: isPod ? conversation.spaceId : "",
    fileTabs: podInfo?.frameTabs ?? [],
    tabsOrder: podInfo?.tabsOrder ?? [],
    isEditor: canEditPod,
  });

  const [createFileTabDraft, setCreateFileTabDraft] =
    useState<PodFileTab | null>(null);

  const getExtraFileMenuItems = useCallback(
    (entry: FileExplorerEntry): FileExplorerMenuAction[] => {
      if (
        !canEditPod ||
        entry.kind !== "frame_package" ||
        !entry.path.startsWith(`pod-${conversation.spaceId}/`)
      ) {
        return [];
      }

      const pinned = isPinned(entry.path);
      const items: FileExplorerMenuAction[] = [
        {
          label: pinned ? "Unpin from banner" : "Pin as Pod banner",
          icon: Pin02,
          onClick: (e) => {
            e.stopPropagation();
            void togglePin(entry.path, { fileName: entry.fileName });
          },
        },
      ];

      if (hasFileTabs) {
        const asTab = isFileTab(entry.path);
        items.push({
          label: asTab ? "Remove from Pod tabs" : "Add as Pod tab",
          icon: LayoutAlt02,
          onClick: (e) => {
            e.stopPropagation();
            if (asTab) {
              void removeFileTab(entry.path, { fileName: entry.fileName });
              return;
            }
            setCreateFileTabDraft({
              path: entry.path,
              title: podFileTabBasename(entry.fileName).slice(
                0,
                MAX_POD_FILE_TAB_TITLE_LENGTH
              ),
              icon: DEFAULT_POD_FILE_TAB_ICON,
            });
          },
        });
      }

      return items;
    },
    [
      canEditPod,
      conversation.spaceId,
      hasFileTabs,
      isFileTab,
      isPinned,
      removeFileTab,
      togglePin,
    ]
  );

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
          getExtraFileMenuItems={getExtraFileMenuItems}
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
          onFileDownload={onFileDownload}
          onOpenInteractive={onOpenInteractive}
          onOpenInPanel={onOpenInPanel}
          owner={owner}
          virtualScopeRoots={virtualScopeRoots}
        />
      </div>

      {createFileTabDraft && (
        <EditPodFileTabDialog
          key={createFileTabDraft.path}
          owner={owner}
          podId={isPod ? conversation.spaceId : ""}
          fileTabs={podInfo?.frameTabs ?? []}
          tabsOrder={podInfo?.tabsOrder ?? []}
          isEditor={canEditPod}
          tab={createFileTabDraft}
          mode="create"
          isOpen
          onClose={() => setCreateFileTabDraft(null)}
        />
      )}
    </div>
  );
}
