import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { DEFAULT_RIGHT_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { ShareFrameSheet } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSheet";
import { InteractiveContentHeader } from "@app/components/assistant/conversation/interactive_content/InteractiveContentHeader";
import { ConfirmContext } from "@app/components/Confirm";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { PinPodBannerButton } from "@app/components/pod/files/PinPodBannerButton";
import { useVisualizationRevert } from "@app/hooks/conversations";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import { useFileContent, useFileMetadata } from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import { normalizeAsInternalDustError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArrowCircleIcon,
  ArrowGoBackIcon,
  Button,
  CheckCircleIcon,
  CloudArrowUpIcon,
  CodeBlock,
  CommandLineIcon,
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
  const isMobile = useIsMobile();
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(DEFAULT_RIGHT_PANEL_SIZE);

  const { spaceInfo: projectInfo, isSpaceInfoLoading } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: conversation?.spaceId ?? projectId ?? null,
  });

  const isFrameInPod = Boolean(
    projectId && projectInfo?.kind === "project" && !projectInfo.archivedAt
  );

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

  const { files: projectFiles } = usePodFiles({
    owner,
    podId: projectId ?? "",
    disabled: !isFrameInPod,
  });

  const framePath = useMemo(() => {
    const entry = projectFiles.find(
      (file) => !file.isDirectory && file.fileId === fileId
    );
    return entry?.path ?? null;
  }, [fileId, projectFiles]);

  const { closePanel, panelRef } = useConversationSidePanelContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The space to resolve `project/` file paths inside the viz.
  // Priority: explicit project the frame was saved to -> the conversation's own project space
  // (a conversation can belong to a project space even before the frame is saved there).
  const frameSpaceId = projectId ?? conversation?.spaceId ?? null;

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

  const [showCode, setShowCode] = React.useState(false);

  const handleEditText = useCallback(
    async ({
      newText,
      oldText,
      targetFileId,
    }: {
      newText: string;
      oldText: string;
      targetFileId?: string;
    }) => {
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/files/${targetFileId ?? fileId}/edit-text`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldText, newText }),
          }
        );

        if (!response.ok) {
          const errorData = await getErrorFromResponse(response);
          return { success: false, error: errorData.message };
        }

        await mutateFileContent(
          `/api/w/${owner.sId}/files/${fileId}?action=view`
        );

        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: normalizeAsInternalDustError(e).message,
        };
      }
    },
    [owner.sId, fileId, mutateFileContent]
  );

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
          Save to <strong>{projectInfo?.name ?? "Pod"}</strong>?
        </>
      ),
      message: (
        <>
          <div>
            The Frame will be part of the Pod knowledge, and be able to be
            edited by any Pod member.
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
          title: "Failed to save to Pod",
          description: errorData.message,
        });
        return;
      }
      sendNotification({
        type: "success",
        title: "Saved to Pod",
        description: `Frame saved to "${projectInfo?.name ?? "Pod"}".`,
      });
      // Invalidate file metadata so parent and this component get updated projectId.
      await mutateFileMetadata();
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Failed to save to Pod",
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
      <div className="flex h-full flex-col">
        <InteractiveContentHeader onClose={onClosePanel} />
        <CenteredState>
          <p className="text-warning-500">
            Error loading file: {error.message}
          </p>
        </CenteredState>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <InteractiveContentHeader onClose={onClosePanel}>
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
            <ShareFrameSheet fileId={fileId} owner={owner} />
            <PinPodBannerButton
              owner={owner}
              spaceId={projectId ?? ""}
              pinnedFramePath={projectInfo?.pinnedFramePath ?? null}
              isEditor={projectInfo?.isEditor ?? false}
              framePath={framePath}
              fileName={fileMetadata?.fileName}
              hidden={!isFrameInPod}
            />
            {projectSaveState === "saved" && (
              <Button
                icon={CheckCircleIcon}
                variant="ghost"
                disabled={true}
                label={isMobile ? undefined : "Saved"}
                tooltip={`Saved in "${projectInfo?.name ?? "unknown Pod"}"`}
              />
            )}
            {projectSaveState === "supported" && (
              <Button
                icon={CloudArrowUpIcon}
                variant="ghost"
                label={
                  isMobile ? undefined : isSavingToProject ? "Saving…" : "Save"
                }
                isLoading={isSavingToProject}
                tooltip={`Save to "${projectInfo?.name ?? "unknown Pod"}"`}
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
              isEditable={true}
              spaceId={frameSpaceId ?? undefined}
              isInDrawer={true}
              onEditText={handleEditText}
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
  const clientType = useClientType();
  return (
    <div className="fixed bottom-4 right-3 flex flex-col gap-1 rounded-lg bg-white p-1 shadow-md dark:bg-gray-900">
      {clientType !== "extension" && (
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
      )}
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
