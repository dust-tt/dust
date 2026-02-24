import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { DEFAULT_RIGHT_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { ShareFramePopover } from "@app/components/assistant/conversation/interactive_content/frame/ShareFramePopover";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/InteractiveContentHeader";
import { ConfirmContext } from "@app/components/Confirm";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useVisualizationRevert } from "@app/hooks/conversations";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { useAuth } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import { isUsingConversationFiles } from "@app/lib/files";
import { useFileContent, useFileMetadata } from "@app/lib/swr/files";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import { datadogLogs } from "@datadog/browser-logs";
import {
  ArrowCircleIcon,
  ArrowDownOnSquareIcon,
  ArrowGoBackIcon,
  Button,
  CheckCircleIcon,
  CloudArrowUpIcon,
  CodeBlock,
  CommandLineIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EyeIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ExportContentDropdownProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  owner: LightWorkspaceType;
  fileId: string;
  fileContent: string | null;
  fileName?: string;
}

function ExportContentDropdown({
  iframeRef,
  owner,
  fileId,
  fileContent,
  fileName,
}: ExportContentDropdownProps) {
  const sendNotification = useSendNotification();
  const [isExportingPdf, setIsExportingPdf] = useState(false);

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

  const exportAsPdf = async (orientation: "portrait" | "landscape") => {
    if (isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/files/${fileId}/export/pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ orientation }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      // Get the PDF blob and trigger download.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      link.download = fileName?.replace(/\.[^.]+$/, ".pdf") ?? "frame.pdf";

      link.click();
      URL.revokeObjectURL(url);

      sendNotification({
        title: "PDF exported",
        type: "success",
        description: "Your PDF has been downloaded.",
      });
    } catch (error) {
      console.error("PDF export failed:", error);
      sendNotification({
        title: "PDF Export Failed",
        type: "error",
        description: "An error occurred while generating the PDF.",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const downloadAsCode = () => {
    try {
      const downloadUrl = `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/${fileId}?action=download`;
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
          label={isExportingPdf ? "Exporting..." : "Export"}
          variant="ghost"
          disabled={isExportingPdf}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isExportingPdf} label="PDF" />
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => exportAsPdf("portrait")}>
              Portrait
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportAsPdf("landscape")}>
              Landscape
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={exportAsPng}>PNG</DropdownMenuItem>
        <DropdownMenuItem onClick={downloadAsCode}>Template</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FrameRendererProps {
  conversation?: ConversationWithoutContentType;
  fileId: string;
  projectId: string | null;
  owner: LightWorkspaceType;
  lastEditedByAgentConfigurationId?: string;
  contentHash?: string;
}

export function FrameRenderer({
  conversation,
  fileId,
  projectId,
  owner,
  lastEditedByAgentConfigurationId,
  contentHash,
}: FrameRendererProps) {
  const { vizUrl } = useAuth();
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(DEFAULT_RIGHT_PANEL_SIZE);

  const { spaceInfo: projectInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? projectId ?? null,
  });

  const projectSaveState = useMemo(() => {
    if (!projectInfo && isSpaceInfoLoading) {
      return "unknown";
    }
    if (
      !conversation?.spaceId ||
      !projectInfo ||
      projectInfo.kind !== "project"
    ) {
      return "unsupported";
    }
    if (!projectId) {
      return "supported";
    }

    return "saved";
  }, [conversation?.spaceId, projectId, projectInfo, isSpaceInfoLoading]);

  const { closePanel, panelRef } = useConversationSidePanelContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // eslint-disable-next-line react-hooks/refs
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

  const { fileMetadata, mutateFileMetadata } = useFileMetadata({
    fileId,
    owner,
  });

  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);
  const [isSavingToProject, setIsSavingToProject] = useState(false);

  const { handleVisualizationRevert } = useVisualizationRevert({
    workspaceId: owner.sId,
    conversationId: conversation?.sId,
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
    // eslint-disable-next-line react-hooks/refs
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

  const handleSaveToProject = useCallback(async () => {
    const projectIdToSave = conversation?.spaceId;
    if (!projectIdToSave) {
      return;
    }

    const confirmed = await confirm({
      title: (
        <>
          Save to <strong>{projectInfo?.name ?? "project"}</strong>?
        </>
      ),
      message: (
        <>
          <div>
            The Frame will be part of the project knowledge, and be able to be
            edited by any project member.
          </div>
          <div>This action cannot be undone.</div>
        </>
      ),
      validateLabel: "Save",
      validateVariant: "primary",
    });
    if (!confirmed) {
      return;
    }
    setIsSavingToProject(true);
    try {
      const res = await clientFetch(
        `/api/w/${owner.sId}/files/${fileId}/save-in-project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: projectIdToSave }),
        }
      );
      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to save to project",
          description: errorData.message,
        });
        return;
      }
      sendNotification({
        type: "success",
        title: "Saved to project",
        description: `Frame saved to "${projectInfo?.name ?? "project"}".`,
      });
      // Invalidate file metadata so parent and this component get updated projectId.
      await mutateFileMetadata();
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Failed to save to project",
        description: e instanceof Error ? e.message : "An error occurred",
      });
    } finally {
      setIsSavingToProject(false);
    }
  }, [
    confirm,
    conversation?.spaceId,
    fileId,
    mutateFileMetadata,
    owner.sId,
    projectInfo?.name,
    sendNotification,
  ]);

  if (error) {
    return (
      <CenteredState>
        <p className="text-warning-500">Error loading file: {error}</p>
      </CenteredState>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <InteractiveContentHeader
        onClose={conversation ? onClosePanel : undefined}
      >
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
              fileName={fileMetadata?.fileName}
            />
            <ShareFramePopover
              fileId={fileId}
              owner={owner}
              isUsingConversationFiles={isFileUsingConversationFiles}
            />
            {projectSaveState === "saved" && (
              <Button
                icon={CheckCircleIcon}
                variant="ghost"
                disabled={true}
                label="Saved"
                tooltip={`Saved in "${projectInfo?.name ?? "unknown project"}"`}
              />
            )}
            {projectSaveState === "supported" && (
              <Button
                icon={CloudArrowUpIcon}
                variant="ghost"
                label={isSavingToProject ? "Saving…" : "Save"}
                isLoading={isSavingToProject}
                tooltip={`Save to "${projectInfo?.name ?? "unknown project"}"`}
                onClick={handleSaveToProject}
              />
            )}
          </div>
        </div>
      </InteractiveContentHeader>

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
              vizUrl={vizUrl}
              visualization={{
                code: fileContent ?? "",
                complete: true,
                identifier: `viz-${fileId}`,
              }}
              key={`viz-${fileId}`}
              conversationId={conversation?.sId ?? null}
              isInDrawer={true}
              ref={iframeRef}
            />
            {conversation && (
              <PreviewActionButtons
                owner={owner}
                lastEditedByAgentConfigurationId={
                  lastEditedByAgentConfigurationId
                }
                hasPreviousVersion={(fileMetadata?.version ?? 0) > 1}
                onRevert={onRevert}
                isFullScreen={isFullScreen}
                exitFullScreen={exitFullScreen}
                enterFullScreen={enterFullScreen}
                reloadFile={reloadFile}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface PreviewActionButtonsProps {
  owner: LightWorkspaceType;
  lastEditedByAgentConfigurationId?: string;
  hasPreviousVersion: boolean;
  onRevert: () => void;
  isFullScreen: boolean;
  enterFullScreen: () => void;
  exitFullScreen: () => void;
  reloadFile: () => void;
}

function PreviewActionButtons({
  lastEditedByAgentConfigurationId,
  hasPreviousVersion,
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
          label={
            hasPreviousVersion
              ? "Revert the last change"
              : "No previous version"
          }
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              variant="ghost"
              disabled={!hasPreviousVersion}
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
