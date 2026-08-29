import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type {
  FileEntry,
  FileExplorerPathEntry,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { withVirtualExplorerPath } from "@app/components/file_explorer/utils";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useFolderPathUrlState } from "@app/hooks/useFolderPathUrlState";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { downloadFile, getFilePathViewUrl } from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import { opensInSidePanel } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, XClose } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

const POD_CONVERSATION_SCOPE_ROOTS = ["conversation", "pod"] as const;

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
  const isPod = isPodConversation(conversation);

  const [currentFolderPath, setCurrentFolderPath] = useFolderPathUrlState();

  const { sandboxFiles, isSandboxFilesLoading } = useConversationSandboxFiles({
    conversationId: conversation.sId,
    owner,
  });

  const { files: podFiles, isPodFilesLoading } = usePodFiles({
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
          onFileDownload={onFileDownload}
          onOpenInteractive={onOpenInteractive}
          onOpenInPanel={onOpenInPanel}
          owner={owner}
          virtualScopeRoots={isPod ? POD_CONVERSATION_SCOPE_ROOTS : undefined}
        />
      </div>
    </div>
  );
}
