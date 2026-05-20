import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type { FileEntry } from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import config from "@app/lib/api/config";
import { downloadSandboxFile } from "@app/lib/swr/files";
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
    (path: string) => downloadSandboxFile(owner, conversation.sId, path),
    [conversation.sId, owner]
  );

  const onFileDownload = useFileDownload({ getFileResponse });

  const onMoveFile = useCallback(
    async (entry: FileEntry, parentRelativePath: string) => {
      const result = await moveMountFile({
        scopedPath: entry.path,
        parentRelativePath: parentRelativePath || undefined,
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
      onMoveFile={onMoveFile}
      onClose={closePanel}
      onOpenInteractive={(entry) =>
        openPanel({ type: "interactive_content", fileId: entry.fileId })
      }
    />
  );
}
