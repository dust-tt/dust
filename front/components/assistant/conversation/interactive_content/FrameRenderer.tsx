import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { DEFAULT_FRAME_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { FrameBetaChip } from "@app/components/assistant/conversation/interactive_content/frame/FrameBetaChip";
import { FrameEditControls } from "@app/components/assistant/conversation/interactive_content/frame/FrameEditControls";
import { ShareFramePopover } from "@app/components/assistant/conversation/interactive_content/frame/ShareFramePopover";
import { useFrameEditSession } from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { useSidePanelFullScreen } from "@app/components/assistant/conversation/useSidePanelFullScreen";
import { ConfirmContext } from "@app/components/Confirm";
import { PinPodBannerButton } from "@app/components/pod/files/PinPodBannerButton";
import { PodFileTabButton } from "@app/components/pod/files/PodFileTabButton";
import { useVisualizationRevert } from "@app/hooks/conversations";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import {
  useFileContent,
  useFileContentByUrl,
  useFileMetadata,
  useShareInteractiveContentFile,
} from "@app/lib/swr/files";
import { useEditFrameText, useFramePermissions } from "@app/lib/swr/frames";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CheckCircle,
  CodeBlock,
  Eye,
  LinkExternal01,
  Maximize01,
  Minimize01,
  RefreshCw01,
  ReverseLeft,
  Spinner,
  Terminal,
  Tooltip,
  UploadCloud02,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useContext, useMemo, useRef, useState } from "react";

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
  const { t } = useLingui();
  const { vizUrl } = useAuth();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);

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

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The space to resolve `project/` file paths inside the viz.
  // Priority: explicit project the frame was saved to -> the conversation's own project space
  // (a conversation can belong to a project space even before the frame is saved there).
  const frameSpaceId = projectId ?? conversation?.spaceId ?? null;

  const {
    isFullScreen,
    enterFullScreen,
    exitFullScreen,
    closePanel: onClosePanel,
  } = useSidePanelFullScreen(DEFAULT_FRAME_PANEL_SIZE);

  const { fileContent, error, mutateFileContent, isFileContentLoading } =
    useFileContent({
      fileId,
      owner,
      cacheKey: contentHash,
    });

  const { fileMetadata, mutateFileMetadata } = useFileMetadata({
    fileId,
    owner,
  });

  const { fileShare } = useShareInteractiveContentFile({
    fileId,
    owner,
    cacheKey: contentHash,
  });

  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const confirm = useContext(ConfirmContext);
  const [isSavingToProject, setIsSavingToProject] = useState(false);

  const { handleVisualizationRevert } = useVisualizationRevert({
    workspaceId: owner.sId,
    conversationId: conversation?.sId,
  });

  const [showCode, setShowCode] = useState(false);

  // A legacy Frame renders its own source, so `fileContent` is the code. A Frames v2 package
  // renders a built bundle, so its sources are fetched separately, and only once shown.
  const frameSourceBaseUrl = `/api/w/${owner.sId}/frames/${encodeURIComponent(fileId)}/source`;
  const frameSourceUrl = contentHash
    ? `${frameSourceBaseUrl}?v=${encodeURIComponent(contentHash)}`
    : frameSourceBaseUrl;
  const {
    fileContent: frameSource,
    isNotFound: isFrameSourceNotFound,
    isFileContentLoading: isFrameSourceLoading,
    fileContentError: frameSourceError,
  } = useFileContentByUrl({
    url: frameSourceUrl,
    disabled: renderMode !== "v2" || !showCode,
  });

  const {
    isFrameAuthor,
    packageRoot,
    hasFrameFunctions,
    isFramePermissionsLoading,
  } = useFramePermissions({
    owner,
    frameId: fileId,
    disabled: renderMode !== "v2" || !conversation,
  });
  const framePackageRoot =
    framePath && framePath.includes("/")
      ? framePath.slice(0, framePath.lastIndexOf("/"))
      : packageRoot;
  // useFile("./…") resolves against framePackageRoot on first fetch and never retries. Wait until
  // permissions (packageRoot) have loaded so the iframe does not mount with a null root.
  const isFramePathPending =
    renderMode === "v2" && Boolean(conversation) && isFramePermissionsLoading;
  const editFrameText = useEditFrameText({
    owner,
    fileId,
    conversationId: conversation?.sId,
  });
  const isEditable =
    renderMode === "legacy" || Boolean(conversation && isFrameAuthor);
  // Frames v2 authors edit in a Preview|Edit session with batch Save. Legacy Frames keep the
  // always-on double-click + blur-save path.
  const canEditV2 = renderMode === "v2" && isEditable;
  const editSession = useFrameEditSession({
    owner,
    fileId,
    conversationId: conversation?.sId,
    iframeRef,
    mutateFileContent,
  });
  // Remount via React key only (identifier stays stable so Next.js keeps one /content URL):
  // on a new contentHash (agent publish / open_frame) and, for v2, after Save/discard/reload.
  const vizInstanceKey = `${
    contentHash
      ? `viz-${contentHash}`
      : `viz-${fileId}-${framePath ?? packageRoot ?? ""}`
  }${renderMode === "v2" ? `-${editSession.contentRevision}` : ""}`;

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

  const reloadFile = async () => {
    setIsLoading(true);
    await mutateFileContent(`/api/w/${owner.sId}/files/${fileId}?action=view`);
    if (renderMode === "v2") {
      // v2 renders a built bundle: remount so react-runner loads the refreshed content.
      editSession.remount();
    }
    setIsLoading(false);
  };

  const onRevert = () => {
    void handleVisualizationRevert({
      fileId,
      agentConfigurationId: lastEditedByAgentConfigurationId ?? "",
    });
  };

  const handleSaveToProject = useCallback(async () => {
    const projectIdToSave = conversation?.spaceId;
    if (!projectIdToSave) {
      return;
    }

    const podName = projectInfo?.name ?? t`Pod`;
    const confirmed = await confirm({
      title: (
        <Trans>
          Save to <strong>{podName}</strong>?
        </Trans>
      ),
      message: (
        <>
          <div>
            <Trans>
              The Frame will be part of the Pod knowledge, and be able to be
              edited by any Pod member.
            </Trans>
          </div>
          <div>
            <Trans>This action cannot be undone.</Trans>
          </div>
        </>
      ),
      validateLabel: t`Save`,
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
        sendApiErrorNotification({
          title: t`Failed to save to Pod`,
          error: errorData,
        });
        return;
      }
      sendNotification({
        type: "success",
        title: t`Saved to Pod`,
        description: t`Frame saved to "${podName}".`,
      });
      // Invalidate file metadata so parent and this component get updated projectId.
      await mutateFileMetadata();
    } catch (e) {
      sendNotification({
        type: "error",
        title: t`Failed to save to Pod`,
        description: e instanceof Error ? e.message : t`An error occurred`,
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
    sendApiErrorNotification,
    t,
  ]);

  if (error) {
    const errorMessage = error.message;
    return (
      <div className="flex h-panel flex-col">
        <ConversationSidePanelHeader onClose={onClosePanel} />
        <CenteredState>
          <p className="text-warning-500">
            <Trans>Error loading file: {errorMessage}</Trans>
          </p>
        </CenteredState>
      </div>
    );
  }

  const savePodName = projectInfo?.name ?? t`unknown Pod`;

  return (
    <div className="flex h-panel flex-col">
      <ConversationSidePanelHeader onClose={onClosePanel}>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              icon={showCode ? Eye : Terminal}
              onClick={() => setShowCode(!showCode)}
              tooltip={showCode ? t`Switch to rendering` : t`Switch to code`}
              variant="ghost"
            />
            {hasFrameFunctions && <FrameBetaChip />}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            {canEditV2 && (
              <FrameEditControls session={editSession} hideLabels={isMobile} />
            )}
            <ExportContentDropdown
              iframeRef={iframeRef}
              owner={owner}
              fileId={fileId}
              fileContent={fileContent ?? null}
              fileName={fileMetadata?.fileName}
              contentType={fileMetadata?.contentType}
            />
            <ShareFramePopover
              key={contentHash ?? fileId}
              fileId={fileId}
              owner={owner}
              contentHash={contentHash}
            />
            {renderMode === "legacy" && (
              <>
                <PinPodBannerButton
                  owner={owner}
                  spaceId={projectId ?? ""}
                  pinnedFramePath={projectInfo?.pinnedFramePath ?? null}
                  isEditor={projectInfo?.isEditor ?? false}
                  framePath={framePath}
                  fileName={fileMetadata?.fileName}
                  hidden={!isFrameInPod}
                />
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
              </>
            )}
            {projectSaveState === "saved" && (
              <Button
                icon={CheckCircle}
                variant="ghost"
                disabled={true}
                label={isMobile ? undefined : t`Saved`}
                tooltip={t`Saved in "${savePodName}"`}
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
                      ? t`Saving…`
                      : t`Save`
                }
                isLoading={isSavingToProject}
                tooltip={t`Save to "${savePodName}"`}
                onClick={handleSaveToProject}
              />
            )}
          </div>
        </div>
      </ConversationSidePanelHeader>

      <div className="flex-1 overflow-hidden">
        {isLoading || isFramePathPending || isFileContentLoading ? (
          <Spinner />
        ) : showCode ? (
          <FrameCodeView
            code={
              renderMode === "v2" ? (frameSource ?? undefined) : fileContent
            }
            isLoading={renderMode === "v2" && isFrameSourceLoading}
            hasError={
              renderMode === "v2" &&
              (isFrameSourceNotFound || Boolean(frameSourceError))
            }
          />
        ) : (
          <div className="h-full">
            <div className="relative h-full">
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
                  // Stable across revisions — contentHash belongs in `key` only.
                  // Putting it in identifier forced Next.js to recompile /content
                  // for every open_frame/publish.
                  identifier: `viz-${fileId}`,
                }}
                key={vizInstanceKey}
                conversationId={conversation?.sId ?? null}
                spaceId={frameSpaceId ?? undefined}
                framePackageRoot={framePackageRoot}
                frameId={renderMode === "v2" ? fileId : undefined}
                frameFileId={fileId}
                isInDrawer={true}
                isEditable={isEditable}
                stagedEditMode={canEditV2 ? editSession.mode : undefined}
                onEditText={
                  !isEditable
                    ? undefined
                    : canEditV2
                      ? editSession.stageEdit
                      : handleEditText
                }
                ref={iframeRef}
              />
              {editSession.isSaving && (
                <div
                  className="absolute inset-0 z-10 cursor-wait"
                  aria-busy="true"
                  aria-label={t`Publishing your changes...`}
                />
              )}
            </div>
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
                shareUrl={fileShare?.shareUrl}
                reloadFile={reloadFile}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FrameCodeViewProps {
  code?: string;
  hasError: boolean;
  isLoading: boolean;
}

function FrameCodeView({ code, hasError, isLoading }: FrameCodeViewProps) {
  if (isLoading) {
    return (
      <CenteredState>
        <Spinner size="sm" />
      </CenteredState>
    );
  }

  if (hasError) {
    return (
      <CenteredState>
        <p className="text-warning-500">
          <Trans>Error loading the Frame source.</Trans>
        </p>
      </CenteredState>
    );
  }

  return (
    <div className="h-full overflow-auto px-4">
      <CodeBlock wrapLongLines className="language-tsx">
        {code}
      </CodeBlock>
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
  shareUrl?: string;
  reloadFile: () => void;
}

function PreviewActionButtons({
  lastEditedByAgentConfigurationId,
  hasPreviousVersion,
  onRevert,
  isFullScreen,
  enterFullScreen,
  exitFullScreen,
  shareUrl,
  reloadFile,
}: PreviewActionButtonsProps) {
  const { t } = useLingui();
  const clientType = useClientType();
  return (
    <div className="fixed bottom-5 right-5 flex flex-col gap-1 rounded-lg bg-background p-1 shadow-md">
      {clientType !== "extension" && (
        <Tooltip
          label={
            isFullScreen ? t`Exit full screen mode` : t`Go to full screen mode`
          }
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
      {clientType !== "extension" && (
        <Tooltip
          label={t`Open in a new tab`}
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              aria-label={t`Open in a new tab`}
              icon={LinkExternal01}
              variant="ghost"
              size="xs"
              disabled={!shareUrl}
              onClick={() =>
                window.open(shareUrl, "_blank", "noopener,noreferrer")
              }
            />
          }
        />
      )}
      {lastEditedByAgentConfigurationId && (
        <Tooltip
          label={
            hasPreviousVersion
              ? t`Revert the last change`
              : t`No previous version`
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
        label={t`Reload the file`}
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
