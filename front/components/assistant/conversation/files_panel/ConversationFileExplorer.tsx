import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import config from "@app/lib/api/config";
import { downloadSandboxFile } from "@app/lib/swr/files";
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

  const { sandboxFiles, isSandboxFilesLoading } = useConversationSandboxFiles({
    conversationId: conversation.sId,
    owner,
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

  return (
    <FileExplorer
      files={sandboxFiles}
      isLoading={isSandboxFilesLoading}
      getFileUrl={getFileUrl}
      onFileDownload={onFileDownload}
      onClose={closePanel}
      onOpenInteractive={(fileId) =>
        openPanel({ type: "interactive_content", fileId })
      }
    />
  );
}
