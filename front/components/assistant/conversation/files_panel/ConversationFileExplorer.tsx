import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import config from "@app/lib/api/config";
import { downloadFile } from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import {
  type ConversationWithoutContentType,
  isPodConversation,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ButtonGroup, cn, XMarkIcon } from "@dust-tt/sparkle";
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
    disabled: !isPod,
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

  const onOpenInteractive = useCallback(
    (entry: { fileId: string }) =>
      openPanel({ type: "interactive_content", fileId: entry.fileId }),
    [openPanel]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppLayoutTitle>
        <div className="flex h-full items-center justify-between gap-2">
          {isPod ? (
            <ButtonGroup
              removeGaps={false}
              className="rounded-lg bg-muted p-0.5 dark:bg-muted-night"
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
          ) : (
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Conversation Files
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={XMarkIcon}
            onClick={closePanel}
          />
        </div>
      </AppLayoutTitle>

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isPod && activeTab !== "conversation" && "hidden"
          )}
        >
          <FileExplorer
            files={sandboxFiles}
            hideBreadcrumbAtRoot
            isLoading={isSandboxFilesLoading}
            getFileUrl={getFileUrl}
            onFileDownload={onFileDownload}
            onOpenInteractive={onOpenInteractive}
          />
        </div>

        {isPod && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              activeTab !== "pod" && "hidden"
            )}
          >
            <FileExplorer
              defaultViewMode="list"
              files={podFiles}
              hideBreadcrumbAtRoot
              isLoading={isPodFilesLoading}
              getFileUrl={getFileUrl}
              onFileDownload={onFileDownload}
              onOpenInteractive={onOpenInteractive}
            />
          </div>
        )}
      </div>
    </div>
  );
}
