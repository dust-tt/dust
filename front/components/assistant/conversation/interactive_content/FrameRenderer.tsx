import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { DEFAULT_FRAME_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { ShareFrameSheet } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSheet";
import { ConfirmContext } from "@app/components/Confirm";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { PinPodBannerButton } from "@app/components/pod/files/PinPodBannerButton";
import { PodFileTabButton } from "@app/components/pod/files/PodFileTabButton";
import { useVisualizationRevert } from "@app/hooks/conversations";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import { useFileContent, useFileMetadata } from "@app/lib/swr/files";
import { useEditFrameText, useFramePermissions } from "@app/lib/swr/frames";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CheckCircle,
  CodeBlock,
  Eye,
  Maximize01,
  Minimize01,
  RefreshCw01,
  ReverseLeft,
  Spinner,
  Terminal,
  Tooltip,
  UploadCloud02,
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
  renderMode: "legacy" | "v2";
}

export function FrameRenderer({
  conversation,
  fileId,
  projectId,
  owner,
  lastEditedByAgentConfigurationId,
  contentHash,
  renderMode,
}: FrameRendererProps) {
  const { vizUrl } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const hasFileTabs = hasFeature("pod_frame_tabs");
  const isMobile = useIsMobile();
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(DEFAULT_FRAME_PANEL_SIZE);

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

  const { isFrameAuthor } = useFramePermissions({
    owner,
    frameId: fileId,
    disabled: renderMode !== "v2" || !conversation,
  });
  const editFrameText = useEditFrameText({
    owner,
    fileId,
    conversationId: conversation?.sId,
  });
  const isEditable =
    renderMode === "legacy" || Boolean(conversation && isFrameAuthor);

  const handleEditText = useCallback(
    async (params: Parameters<typeof editFrameText>[0]) => {
      const result = await editFrameText(params);

      if (result.success) {
        try {
          await mutateFileContent();
        } catch {
          // The mutation already succeeded. Keep the inline edit and let the next reload fetch
          // the active publication rather than reporting a false save failure to the iframe.
        }
      }

      return result;
    },
    [editFrameText, mutateFileContent]
  );

  const restoreLayout = useCallback(() => {
    if (panel) {
      setIsNavigationBarOpen(isNavBarPrevOpenRef.current ?? true);
      panel.resize(prevPanelSizeRef.current ?? DEFAULT_FRAME_PANEL_SIZE);
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
      <div className="flex h-panel flex-col">
        <ConversationSidePanelHeader onClose={onClosePanel} />
        <CenteredState>
          <p className="text-warning-500">
            Error loading file: {error.message}
          </p>
        </CenteredState>
      </div>
    );
  }

  return (
    <div className="flex h-panel flex-col">
      <ConversationSidePanelHeader onClose={onClosePanel}>
        {renderMode === "legacy" && (
          <div className="flex w-full items-center justify-between">
            <Button
              icon={showCode ? Eye : Terminal}
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
              <ShareFrameSheet
                key={contentHash ?? fileId}
                fileId={fileId}
                owner={owner}
                contentHash={contentHash}
              />
              <PinPodBannerButton
                owner={owner}
                spaceId={projectId ?? ""}
                pinnedFramePath={projectInfo?.pinnedFramePath ?? null}
                isEditor={projectInfo?.isEditor ?? false}
                framePath={framePath}
                fileName={fileMetadata?.fileName}
                hidden={!isFrameInPod}
              />
              {hasFileTabs && (
                <PodFileTabButton
                  owner={owner}
                  spaceId={projectId ?? ""}
                  fileTabs={projectInfo?.frameTabs ?? []}
                  tabsOrder={projectInfo?.tabsOrder ?? []}
                  isEditor={projectInfo?.isEditor ?? false}
                  filePath={framePath}
                  fileName={fileMetadata?.fileName}
                  hidden={!isFrameInPod}
                />
              )}
              {projectSaveState === "saved" && (
                <Button
                  icon={CheckCircle}
                  variant="ghost"
                  disabled={true}
                  label={isMobile ? undefined : "Saved"}
                  tooltip={`Saved in "${projectInfo?.name ?? "unknown Pod"}"`}
                />
              )}
              {projectSaveState === "supported" && (
                <Button
                  icon={UploadCloud02}
                  variant="ghost"
                  label={
                    isMobile
                      ? undefined
                      : isSavingToProject
                        ? "Saving…"
                        : "Save"
                  }
                  isLoading={isSavingToProject}
                  tooltip={`Save to "${projectInfo?.name ?? "unknown Pod"}"`}
                  onClick={handleSaveToProject}
                />
              )}
            </div>
          </div>
        )}
        {renderMode === "v2" && (
          <div className="flex w-full justify-end">
            <ExportContentDropdown
              iframeRef={iframeRef}
              owner={owner}
              fileId={fileId}
              fileContent={fileContent ?? null}
              fileName={fileMetadata?.fileName}
            />
            <ShareFrameSheet
              key={contentHash ?? fileId}
              fileId={fileId}
              owner={owner}
              contentHash={contentHash}
            />
          </div>
        )}
      </ConversationSidePanelHeader>

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
            <AuthenticatedVisualizationActionIframe
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
              spaceId={frameSpaceId ?? undefined}
              framePath={framePath}
              frameId={renderMode === "v2" ? fileId : undefined}
              isInDrawer={true}
              isEditable={isEditable}
              onEditText={isEditable ? handleEditText : undefined}
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
    <div className="fixed bottom-5 right-5 flex flex-col gap-1 rounded-lg bg-background p-1 shadow-md">
      {clientType !== "extension" && (
        <Tooltip
          label={`${isFullScreen ? "Exit" : "Go to"} full screen mode`}
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              icon={isFullScreen ? Minimize01 : Maximize01}
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
              icon={ReverseLeft}
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
            icon={RefreshCw01}
            variant="ghost"
            size="xs"
            onClick={reloadFile}
          />
        }
      />
    </div>
  );
}
