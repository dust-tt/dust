import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
import { useFolderPathUrlState } from "@app/hooks/useFolderPathUrlState";
import { useQueryParams } from "@app/hooks/useQueryParams";
import { downloadFile, getFilePathViewUrl } from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import {
  type ConversationWithoutContentType,
  isPodConversation,
} from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, ButtonGroup, cn, XClose } from "@dust-tt/sparkle";
import { useCallback } from "react";

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

  const { filesTab } = useQueryParams(["filesTab"]);
  const activeTab: FilesTab =
    isPod && filesTab.value === "pod" ? "pod" : "conversation";
  const setActiveTab = (tab: FilesTab) => filesTab.setParam(tab);

  // Each tab keeps its own folder navigation in the URL under a distinct key.
  const [convFolderPath, setConvFolderPath] =
    useFolderPathUrlState("convFolderPath");
  const [podFolderPath, setPodFolderPath] =
    useFolderPathUrlState("podFolderPath");

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

  return (
    <div className="flex h-panel min-h-0 flex-col">
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
            <span className="text-sm text-foreground dark:text-foreground-night">
              Conversation Files
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={XClose}
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
            currentFolderPath={convFolderPath}
            onCurrentFolderChange={setConvFolderPath}
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
              currentFolderPath={podFolderPath}
              onCurrentFolderChange={setPodFolderPath}
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
