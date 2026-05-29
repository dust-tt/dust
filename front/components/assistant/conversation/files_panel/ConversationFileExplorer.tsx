import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import {
  getScopedRelativePath,
  joinMountRelativePath,
} from "@app/components/file_explorer/utils";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import config from "@app/lib/api/config";
import { downloadFile } from "@app/lib/swr/files";
import { useMoveMountFile } from "@app/lib/swr/mount_files";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

interface ConversationFileExplorerProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationFileExplorer({
  conversation,
  owner,
}: ConversationFileExplorerProps) {
  const { closePanel, openPanel } = useConversationSidePanelContext();

  const { sandboxFiles, isSandboxFilesLoading, mutateSandboxFiles } =
    useConversationSandboxFiles({
      conversationId: conversation.sId,
      owner,
    });

  const moveMountFile = useMoveMountFile({
    filesApiBasePath: `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/files`,
  });

  const getFileUrl = useCallback(
    (path: string) =>
      `${config.getApiBaseUrl()}/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/files/${path}`,
    [conversation.sId, owner.sId]
  );

  const getFileResponse = useCallback(
    (path: string) => downloadFile(owner, path),
    [owner]
  );

  const onFileDownload = useFileDownload({ getFileResponse });

  // Pass to FileExplorer component to enable file moving.
  const _onMoveFile = useCallback(
    async (entry: FileEntry, parentRelativePath: string) => {
      const result = await moveMountFile({
        relativeFilePath: getScopedRelativePath(entry.path),
        destRelativeFilePath: joinMountRelativePath(
          parentRelativePath,
          entry.fileName
        ),
      });
      if (result.isOk()) {
        await mutateSandboxFiles();
      }
      return result;
    },
    [moveMountFile, mutateSandboxFiles]
  );

  return (
    <FileExplorer
      files={sandboxFiles}
      isLoading={isSandboxFilesLoading}
      getFileUrl={getFileUrl}
      onFileDownload={onFileDownload}
      onClose={closePanel}
      onOpenInteractive={(entry) =>
        openPanel({ type: "interactive_content", fileId: entry.fileId })
      }
    />
  );
}
