import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import config from "@app/lib/api/config";
import { downloadFile } from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import {
  type ConversationWithoutContentType,
  isPodConversation,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ButtonGroup } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

type FilesTab = "conversation" | "pod";

interface ConversationFileExplorerProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationFileExplorer({
  conversation,
  owner,
}: ConversationFileExplorerProps) {
  const { closePanel, openPanel } = useConversationSidePanelContext();
  const isPod = isPodConversation(conversation);
  const [activeTab, setActiveTab] = useState<FilesTab>("conversation");

  const { sandboxFiles, isSandboxFilesLoading } = useConversationSandboxFiles({
    conversationId: conversation.sId,
    owner,
  });

  const { files: podFiles, isPodFilesLoading } = usePodFiles({
    owner,
    podId: isPod ? conversation.spaceId : "",
    disabled: !isPod || activeTab !== "pod",
  });

  const getFileUrl = useCallback(
    (path: string) => {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      return `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/path/${encoded}`;
    },
    [owner.sId]
  );

  const getFileResponse = useCallback(
    (path: string) => downloadFile(owner, path),
    [owner]
  );

  const onFileDownload = useFileDownload({ getFileResponse });

  const isOnPodTab = isPod && activeTab === "pod";

  return (
    <FileExplorer
      key={activeTab}
      files={isOnPodTab ? podFiles : sandboxFiles}
      isLoading={isOnPodTab ? isPodFilesLoading : isSandboxFilesLoading}
      getFileUrl={getFileUrl}
      onFileDownload={onFileDownload}
      onClose={closePanel}
      rootTitle={
        isPod ? (
          <ButtonGroup
            removeGaps={false}
            className="rounded-lg bg-muted dark:bg-muted-night p-0.5"
          >
            <Button
              size="xs"
              variant={activeTab === "conversation" ? "outline" : "ghost"}
              label="Conversation Files"
              onClick={() => setActiveTab("conversation")}
            />
            <Button
              size="xs"
              variant={activeTab === "pod" ? "outline" : "ghost"}
              label="Pod Files"
              onClick={() => setActiveTab("pod")}
            />
          </ButtonGroup>
        ) : undefined
      }
      onOpenInteractive={(entry) =>
        openPanel({ type: "interactive_content", fileId: entry.fileId })
      }
    />
  );
}
