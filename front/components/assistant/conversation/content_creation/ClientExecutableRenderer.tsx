import { datadogLogs } from "@datadog/browser-logs";
import {
  ArrowCircleIcon,
  ArrowDownOnSquareIcon,
  ArrowGoBackIcon,
  Button,
  CodeBlock,
  CommandLineIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { DEFAULT_RIGHT_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { CenteredState } from "@app/components/assistant/conversation/content_creation/CenteredState";
import { ContentCreationHeader } from "@app/components/assistant/conversation/content_creation/ContentCreationHeader";
import { ShareContentCreationFilePopover } from "@app/components/assistant/conversation/content_creation/ShareContentCreationFilePopover";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { isUsingConversationFiles } from "@app/lib/files";
import { useVisualizationRevert } from "@app/lib/swr/conversations";
import { useFileContent, useFileMetadata } from "@app/lib/swr/files";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";

interface ExportContentDropdownProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  owner: LightWorkspaceType;
  fileId: string;
  fileContent: string | null;
}

function ExportContentDropdown({
  iframeRef,
  owner,
  fileId,
  fileContent,
}: ExportContentDropdownProps) {
  const sendNotification = useSendNotification();
  const exportAsPng = () => {
    if (fileContent) {
      const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
      if (imgRegex.test(fileContent)) {
        sendNotification({
          type: "error",
          title: "Cannot export as PNG",
          description:
            "Content contains images with external URLs, which are blocked for " +
            "security purposes. Please use images uploaded to the conversation instead.",
        });
        return;
      }
    }

    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: `EXPORT_PNG` }, "*");
    } else {
      datadogLogs.logger.info(
        "Failed to export content as PNG: No iframe content window found"
      );
    }
  };

  const downloadAsCode = () => {
    try {
      const downloadUrl = `/api/w/${owner.sId}/files/${fileId}?action=download`;
      // Open the download URL in a new tab/window. Otherwise we get a CORS error due to the redirection
      // to cloud storage.
      window.open(downloadUrl, "_blank");
    } catch (error) {
      console.error("Download failed:", error);
      sendNotification({
        title: "Download Failed",
        type: "error",
        description: "An error occurred while opening the download link.",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={ArrowDownOnSquareIcon}
          isSelect
          label="Download"
          variant="ghost"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={exportAsPng}>
          Download as PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadAsCode}>
          Download as template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ClientExecutableRendererProps {
  conversation: ConversationWithoutContentType;
  fileId: string;
  owner: LightWorkspaceType;
  lastEditedByAgentConfigurationId?: string;
  contentHash?: string;
}

export function ClientExecutableRenderer({
  conversation,
  fileId,
  owner,
  lastEditedByAgentConfigurationId,
  contentHash,
}: ClientExecutableRendererProps) {
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(DEFAULT_RIGHT_PANEL_SIZE);

  const { closePanel, panelRef } = useConversationSidePanelContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const panel = panelRef?.current;

  const [fullScreenHash, setFullScreenHash] = useHashParam(
    FULL_SCREEN_HASH_PARAM
  );
  const isFullScreen = fullScreenHash === "true";

  const { fileContent, error, mutateFileContent } = useFileContent({
    fileId,
    owner,
    cacheKey: contentHash,
  });

  const { fileMetadata } = useFileMetadata({ fileId, owner });

  // Ideally we should not show the revert button when it's not applicable (e.g. there is no edit)
  // but it's not easy to compute here so we show the button all the time for now.
  const { handleVisualizationRevert } = useVisualizationRevert({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  });

  const isFileUsingConversationFiles = React.useMemo(
    () => (fileContent ? isUsingConversationFiles(fileContent) : false),
    [fileContent]
  );

  const [showCode, setShowCode] = React.useState(false);

  const restoreLayout = useCallback(() => {
    if (panel) {
      setIsNavigationBarOpen(isNavBarPrevOpenRef.current ?? true);
      panel.resize(prevPanelSizeRef.current ?? DEFAULT_RIGHT_PANEL_SIZE);
    }
  }, [panel, setIsNavigationBarOpen]);

  const exitFullScreen = useCallback(() => {
    setFullScreenHash(undefined);
  }, [setFullScreenHash]);

  const enterFullScreen = () => {
    isNavBarPrevOpenRef.current = isNavigationBarOpen;

    if (panel) {
      prevPanelSizeRef.current = panel.getSize();
    }

    setFullScreenHash("true");
  };

  const onClosePanel = () => {
    if (panel && isFullScreen) {
      setFullScreenHash(undefined);
      restoreLayout();
    }

    closePanel();
  };

  const reloadFile = async () => {
    setIsLoading(true);
    await mutateFileContent(`/api/w/${owner.sId}/files/${fileId}?action=view`);
    setIsLoading(false);
  };

  const onRevert = () => {
    void handleVisualizationRevert({
      fileId,
      agentConfigurationId: lastEditedByAgentConfigurationId ?? "",
    });
  };

  useEffect(() => {
    if (!panel) {
      return;
    }

    if (isFullScreen) {
      panel.resize(100);
      setIsNavigationBarOpen(false);
    } else {
      // Only exit fullscreen if we're currently at 100% & nav bar is closed (= full screen mode)
      if (panel.getSize() === 100 && !isNavigationBarOpen) {
        restoreLayout();
      }
    }
  }, [
    panel,
    isFullScreen,
    isNavigationBarOpen,
    setIsNavigationBarOpen,
    restoreLayout,
  ]);

  // ESC key event listener to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullScreen) {
        exitFullScreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullScreen, exitFullScreen]);

  const getFileBlob = useCallback(
    async (fileId: string): Promise<Blob | null> => {
      const response = await fetch(
        `/api/w/${owner.sId}/files/${fileId}?action=view`
      );
      if (!response.ok) {
        return null;
      }

      const resBuffer = await response.arrayBuffer();

      return new Blob([resBuffer], {
        type: response.headers.get("Content-Type") ?? undefined,
      });
    },
    [owner.sId]
  );

  if (error) {
    return (
      <CenteredState>
        <p className="text-warning-500">Error loading file: {error}</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ContentCreationHeader onClose={onClosePanel}>
        <div className="flex w-full items-center justify-between">
          <Button
            icon={showCode ? EyeIcon : CommandLineIcon}
            onClick={() => setShowCode(!showCode)}
            tooltip={showCode ? "Switch to Rendering" : "Switch to Code"}
            variant="ghost"
          />
          <div className="flex items-center">
            <ExportContentDropdown
              iframeRef={iframeRef}
              owner={owner}
              fileId={fileId}
              fileContent={fileContent ?? null}
            />
            <ShareContentCreationFilePopover
              fileId={fileId}
              owner={owner}
              isUsingConversationFiles={isFileUsingConversationFiles}
            />
          </div>
        </div>
      </ContentCreationHeader>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <Spinner />
        ) : showCode ? (
          <div className="h-full overflow-auto px-4">
            <CodeBlock wrapLongLines className="language-tsx">
              {fileContent}
            </CodeBlock>
          </div>
        ) : (
          <div className="h-full">
            <VisualizationActionIframe
              agentConfigurationId={
                fileMetadata?.useCaseMetadata
                  .lastEditedByAgentConfigurationId ?? ""
              }
              workspaceId={owner.sId}
              visualization={{
                code: fileContent ?? "",
                complete: true,
                identifier: `viz-${fileId}`,
              }}
              key={`viz-${fileId}`}
              conversationId={conversation.sId}
              isInDrawer={true}
              ref={iframeRef}
              getFileBlob={getFileBlob}
            />
            <PreviewActionButtons
              owner={owner}
              conversation={conversation}
              lastEditedByAgentConfigurationId={
                lastEditedByAgentConfigurationId
              }
              onRevert={onRevert}
              isFullScreen={isFullScreen}
              exitFullScreen={exitFullScreen}
              enterFullScreen={enterFullScreen}
              reloadFile={reloadFile}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface PreviewActionButtonsProps {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType;
  lastEditedByAgentConfigurationId?: string;
  onRevert: () => void;
  isFullScreen: boolean;
  enterFullScreen: () => void;
  exitFullScreen: () => void;
  reloadFile: () => void;
}

function PreviewActionButtons({
  lastEditedByAgentConfigurationId,
  onRevert,
  isFullScreen,
  enterFullScreen,
  exitFullScreen,
  reloadFile,
}: PreviewActionButtonsProps) {
  return (
    <div className="fixed bottom-4 right-3 flex flex-col gap-1 rounded-lg bg-white p-1 shadow-md dark:bg-gray-900">
      <Tooltip
        label={`${isFullScreen ? "Exit" : "Go to"} full screen mode`}
        side="left"
        tooltipTriggerAsChild
        trigger={
          <Button
            icon={isFullScreen ? FullscreenExitIcon : FullscreenIcon}
            variant="ghost"
            size="xs"
            onClick={isFullScreen ? exitFullScreen : enterFullScreen}
          />
        }
      />
      {lastEditedByAgentConfigurationId && (
        <Tooltip
          label="Revert the last change"
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              variant="ghost"
              size="xs"
              icon={ArrowGoBackIcon}
              onClick={onRevert}
            />
          }
        />
      )}
      <Tooltip
        label="Reload the file"
        side="left"
        tooltipTriggerAsChild
        trigger={
          <Button
            icon={ArrowCircleIcon}
            variant="ghost"
            size="xs"
            onClick={reloadFile}
          />
        }
      />
    </div>
  );
}
