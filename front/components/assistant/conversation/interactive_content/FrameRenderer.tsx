import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { DEFAULT_FRAME_PANEL_SIZE } from "@app/components/assistant/conversation/constant";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { FrameBetaChip } from "@app/components/assistant/conversation/interactive_content/frame/FrameBetaChip";
import { ShareFramePopover } from "@app/components/assistant/conversation/interactive_content/frame/ShareFramePopover";
import { ConfirmContext } from "@app/components/Confirm";
import { MarkdownFilePreviewViewModeSwitch } from "@app/components/file_explorer/MarkdownFilePreview";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { PinPodBannerButton } from "@app/components/pod/files/PinPodBannerButton";
import { PodFileTabButton } from "@app/components/pod/files/PodFileTabButton";
import { useVisualizationRevert } from "@app/hooks/conversations";
import { useHashParam } from "@app/hooks/useHashParams";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import {
  useFileContent,
  useFileContentByUrl,
  useFileMetadata,
  useShareInteractiveContentFile,
} from "@app/lib/swr/files";
import {
  useBatchEditFrameText,
  useEditFrameText,
  useFramePermissions,
} from "@app/lib/swr/frames";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaceInfo } from "@app/lib/swr/spaces";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { EditTextFn } from "@app/types/assistant/visualization";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Check,
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
import {
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

  const { fileShare } = useShareInteractiveContentFile({
    fileId,
    owner,
    cacheKey: contentHash,
  });

  const sendNotification = useSendNotification();
  const confirm = useContext(ConfirmContext);
  const [isSavingToProject, setIsSavingToProject] = useState(false);

  const { handleVisualizationRevert } = useVisualizationRevert({
    workspaceId: owner.sId,
    conversationId: conversation?.sId,
  });

  const [showCode, setShowCode] = useState(false);
  // Inline text editing is opt-in: authors must enter edit mode explicitly so previewing does
  // not surface hover affordances on every text node. Reset when switching Frames.
  const [editModeState, setEditModeState] = useState({
    fileId,
    enabled: false,
  });
  // Bumped after a successful live edit (or explicit reload) so the viz iframe remounts with the
  // refreshed bundle. Without this, react-runner keeps the old module and any Frame re-render
  // overwrites the optimistic DOM textContent patch — edits look saved then snap back (#10579).
  const [contentRevision, setContentRevision] = useState(0);
  // Frames v2 only: staged location edits accumulate until Save (one publish). Legacy frames still
  // save per blur. Discarding Edit clears the queue without writing.
  const [pendingEdits, setPendingEdits] = useState<Parameters<EditTextFn>[0][]>(
    []
  );
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  // Legacy concurrent blurs: defer remount until in-flight publishes settle.
  const inFlightEditsRef = useRef(0);
  const pendingRemountRef = useRef(false);
  if (editModeState.fileId !== fileId) {
    setEditModeState({ fileId, enabled: false });
    setContentRevision(0);
    setPendingEdits([]);
    setIsSavingEdits(false);
    inFlightEditsRef.current = 0;
    pendingRemountRef.current = false;
  }
  const isEditMode = editModeState.enabled;
  const hasPendingEdits = pendingEdits.length > 0;
  const usesBatchEdit = renderMode === "v2";

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
  const batchEditFrameText = useBatchEditFrameText({
    owner,
    fileId,
    conversationId: conversation?.sId,
  });
  // Legacy Frames have no separate author flag: anyone who can open them in the conversation
  // drawer could previously edit. Frame v2 uses write access to the source (`isFrameAuthor`).
  const isAuthor =
    renderMode === "legacy" || (!isFramePermissionsLoading && isFrameAuthor);
  // Inline editing needs a conversation (v2 edit-text requires conversationId + source).
  const canEnterEditMode =
    renderMode === "legacy"
      ? Boolean(conversation)
      : Boolean(conversation && isFrameAuthor);
  const isEditable = isEditMode && canEnterEditMode;
  // Include edit mode so Preview↔Edit remounts and resets contentHeight (async-network-loading-state).
  const vizInstanceId = `viz-${fileId}-${contentRevision}-${isEditable ? "edit" : "preview"}`;

  // Legacy: publish on every blur. v2: stage location edits until Save (one publish).
  const handleEditText = useCallback<EditTextFn>(
    async (params) => {
      if (!usesBatchEdit) {
        inFlightEditsRef.current += 1;
        try {
          const result = await editFrameText(params);
          if (result.success) {
            try {
              await mutateFileContent();
              pendingRemountRef.current = true;
            } catch {
              // Mutation already succeeded; keep the inline edit rather than failing the blur.
            }
          }
          return result;
        } finally {
          inFlightEditsRef.current -= 1;
          if (inFlightEditsRef.current === 0 && pendingRemountRef.current) {
            pendingRemountRef.current = false;
            setContentRevision((revision) => revision + 1);
          }
        }
      }

      // v2 batch: only location-based edits. Context-string edits are too brittle to stage.
      if (!params.source) {
        return {
          success: false,
          error:
            "This text can't be batch-edited; reload the Frame and try again.",
        };
      }

      setPendingEdits((prev) => {
        const key = params.source!;
        const existingIndex = prev.findIndex((edit) => edit.source === key);
        const next =
          existingIndex >= 0
            ? prev.map((edit, index) =>
                index === existingIndex
                  ? { ...edit, newText: params.newText }
                  : edit
              )
            : [...prev, params];
        pendingEditsRef.current = next;
        return next;
      });
      return { success: true };
    },
    [editFrameText, mutateFileContent, usesBatchEdit]
  );

  const flushInProgressEditable = useCallback(async () => {
    const contentWindow = iframeRef.current?.contentWindow;
    if (!contentWindow) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve();
      }, 2000);

      function onMessage(event: MessageEvent) {
        if (event.data?.type === "FLUSH_EDITABLES_DONE") {
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          resolve();
        }
      }

      window.addEventListener("message", onMessage);
      contentWindow.postMessage({ type: "FLUSH_EDITABLES" }, "*");
    });
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (!usesBatchEdit || isSavingEdits) {
      return;
    }

    setIsSavingEdits(true);
    try {
      await flushInProgressEditable();
      const editsToSave = pendingEditsRef.current.filter((edit) => edit.source);
      if (editsToSave.length === 0) {
        return;
      }

      const result = await batchEditFrameText(editsToSave);
      if (!result.success) {
        sendNotification({
          type: "error",
          title: "Couldn't save edits",
          description: result.error ?? "Please try again.",
        });
        return;
      }

      setPendingEdits([]);
      try {
        await mutateFileContent();
      } catch {
        // Mutation succeeded server-side; remount anyway so the next load picks up content.
      }
      setContentRevision((revision) => revision + 1);
    } finally {
      setIsSavingEdits(false);
    }
  }, [
    batchEditFrameText,
    flushInProgressEditable,
    isSavingEdits,
    mutateFileContent,
    sendNotification,
    usesBatchEdit,
  ]);

  const handleViewModeChange = useCallback(
    async (mode: "preview" | "edit") => {
      if (mode === "edit") {
        setEditModeState({ fileId, enabled: true });
        return;
      }

      if (!usesBatchEdit || !hasPendingEdits) {
        setEditModeState({ fileId, enabled: false });
        return;
      }

      const discard = await confirm({
        title: "Discard unsaved edits?",
        message: "You have unsaved text edits. Leaving Edit will discard them.",
        validateLabel: "Discard",
        validateVariant: "warning",
        cancelLabel: "Cancel",
      });
      if (!discard) {
        return;
      }

      setPendingEdits([]);
      setEditModeState({ fileId, enabled: false });
      // Remount so optimistic DOM text is wiped and Preview shows the last published content.
      setContentRevision((revision) => revision + 1);
    },
    [confirm, fileId, hasPendingEdits, usesBatchEdit]
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
    try {
      await mutateFileContent();
      setContentRevision((revision) => revision + 1);
    } finally {
      setIsLoading(false);
    }
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
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              icon={showCode ? Eye : Terminal}
              onClick={() => setShowCode(!showCode)}
              tooltip={showCode ? "Switch to Rendering" : "Switch to Code"}
              variant="ghost"
            />
            {hasFrameFunctions && <FrameBetaChip />}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            {isAuthor &&
              (canEnterEditMode ? (
                <>
                  <MarkdownFilePreviewViewModeSwitch
                    viewMode={isEditable ? "edit" : "preview"}
                    hideLabels={isMobile}
                    disabled={isSavingEdits}
                    onViewModeChange={(mode) => {
                      void handleViewModeChange(mode);
                    }}
                  />
                  {usesBatchEdit && isEditable && (
                    <Button
                      // Keep an icon so the control stays visible when the label is
                      // hidden on narrow headers (same pattern as Preview|Edit).
                      label={isMobile ? undefined : "Save"}
                      icon={Check}
                      size="xs"
                      variant="ghost"
                      isLoading={isSavingEdits}
                      disabled={!hasPendingEdits || isSavingEdits}
                      onClick={() => {
                        void handleSaveEdits();
                      }}
                      aria-label="Save"
                      tooltip={
                        hasPendingEdits ? "Save text edits" : "No unsaved edits"
                      }
                    />
                  )}
                </>
              ) : (
                <Tooltip
                  label="Text editing isn't available for this Frame right now."
                  side="bottom"
                  tooltipTriggerAsChild
                  trigger={
                    <span className="inline-flex shrink-0">
                      <MarkdownFilePreviewViewModeSwitch
                        viewMode="preview"
                        hideLabels={isMobile}
                        disabled
                        onViewModeChange={() => undefined}
                      />
                    </span>
                  }
                />
              ))}
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
              </>
            )}
          </div>
        </div>
      </ConversationSidePanelHeader>

      <div className="flex-1 overflow-hidden">
        {isLoading || isFramePathPending ? (
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
                identifier: vizInstanceId,
              }}
              key={`${vizInstanceId}-${framePath ?? packageRoot ?? ""}`}
              conversationId={conversation?.sId ?? null}
              spaceId={frameSpaceId ?? undefined}
              framePackageRoot={framePackageRoot}
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
        <p className="text-warning-500">Error loading the Frame source.</p>
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
      {clientType !== "extension" && (
        <Tooltip
          label="Open in a new tab"
          side="left"
          tooltipTriggerAsChild
          trigger={
            <Button
              aria-label="Open in a new tab"
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
