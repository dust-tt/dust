import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { FrameCodeView } from "@app/components/assistant/conversation/interactive_content/frame/FrameCodeView";
import { FrameToolbar } from "@app/components/assistant/conversation/interactive_content/frame/FrameToolbar";
import { useFrameEditSession } from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { useFileContent, useFileContentByUrl } from "@app/lib/swr/files";
import { useFramePermissions } from "@app/lib/swr/frames";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { PodFileTab } from "@app/types/pod_file_tab";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, cn, DotsHorizontal, Spinner } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PodHoverFrameViewerProps {
  owner: LightWorkspaceType;
  spaceId: string;
  fileId: string;
  fileContent: string;
  vizUrl: string;
  identifier: string;
  isPodEditor: boolean;
  isPodMember: boolean;
  /** Stable FileResource identity for Frame v2; omitted for legacy Frames. */
  frameId?: string;
  framePath: string;
  fileName?: string;
  contentType?: string;
  pinnedFramePath: string | null;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isArchived?: boolean;
  /** Banner-specific actions (hide / unpin) rendered before the shared toolbar. */
  overlayLeading?: ReactNode;
  /** Open in fullscreen on mount (e.g. collapsed banner "full screen" affordance). */
  initialFullscreen?: boolean;
  className?: string;
}

/**
 * Pod Frame with hover/focus toolbar chrome (pinned banner and file tabs).
 * Document embeds keep using the bare {@link PodFrameVisualization} iframe.
 */
export function PodHoverFrameViewer({
  owner,
  spaceId,
  fileId,
  fileContent,
  vizUrl,
  identifier,
  isPodEditor,
  isPodMember,
  frameId,
  framePath,
  fileName,
  contentType,
  pinnedFramePath,
  fileTabs,
  tabsOrder,
  isArchived = false,
  overlayLeading,
  initialFullscreen = false,
  className,
}: PodHoverFrameViewerProps) {
  const { t } = useLingui();
  const isMobile = useIsMobile();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showCode, setShowCode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  // Mobile has no hover: a tap pins the overlay until dismissed.
  const [controlsPinned, setControlsPinned] = useState(false);

  useEffect(() => {
    if (initialFullscreen) {
      setIsFullscreen(true);
    }
  }, [initialFullscreen]);

  const isV2 = Boolean(frameId);
  const { mutateFileContent } = useFileContent({
    fileId,
    owner,
    config: { disabled: !isV2 },
  });

  const { canWriteFrameSource, hasFrameFunctions, isFramePermissionsLoading } =
    useFramePermissions({
      owner,
      frameId: frameId ?? "",
      disabled: !isV2,
    });

  const frameSourceUrl = `/api/w/${owner.sId}/frames/${encodeURIComponent(fileId)}/source`;
  const {
    fileContent: frameSource,
    isNotFound: isFrameSourceNotFound,
    isFileContentLoading: isFrameSourceLoading,
    fileContentError: frameSourceError,
  } = useFileContentByUrl({
    url: frameSourceUrl,
    disabled: !isV2 || !showCode,
  });

  const canEditV2 = isV2 && canWriteFrameSource;
  const editSession = useFrameEditSession({
    owner,
    fileId,
    conversationId: undefined,
    iframeRef,
    mutateFileContent,
  });

  const framePackageRoot = framePath.includes("/")
    ? framePath.slice(0, framePath.lastIndexOf("/"))
    : null;

  const vizInstanceKey = `${identifier}${
    isV2 ? `-${editSession.contentRevision}` : ""
  }`;

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const overlayVisible = controlsPinned || isFullscreen;

  const toolbar = (
    <FrameToolbar
      layout="end"
      owner={owner}
      fileId={fileId}
      iframeRef={iframeRef}
      fileContent={fileContent}
      fileName={fileName}
      contentType={contentType}
      showCode={showCode}
      onToggleCode={
        !isV2 || canWriteFrameSource ? () => setShowCode(!showCode) : undefined
      }
      hasFrameFunctions={hasFrameFunctions}
      editSession={editSession}
      canEditV2={canEditV2}
      hideEditLabels={isMobile}
      podActions={{
        spaceId,
        pinnedFramePath,
        isEditor: isPodEditor,
        framePath,
        fileName,
        fileTabs,
        tabsOrder,
        hidden: isArchived,
      }}
      fullscreen={{
        isFullscreen,
        onToggle: () => setIsFullscreen((prev) => !prev),
      }}
    />
  );

  const body =
    isV2 && isFramePermissionsLoading ? (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    ) : showCode ? (
      <FrameCodeView
        code={isV2 ? (frameSource ?? undefined) : fileContent}
        isLoading={isV2 && isFrameSourceLoading}
        hasError={isV2 && (isFrameSourceNotFound || Boolean(frameSourceError))}
      />
    ) : (
      <div className="relative h-full">
        <AuthenticatedVisualizationActionIframe
          agentConfigurationId={null}
          workspaceId={owner.sId}
          vizUrl={vizUrl}
          visualization={{
            code: fileContent,
            complete: true,
            identifier,
          }}
          key={vizInstanceKey}
          conversationId={null}
          spaceId={spaceId}
          framePackageRoot={framePackageRoot}
          frameId={frameId}
          isInDrawer={true}
          isEditable={canEditV2}
          stagedEditMode={canEditV2 ? editSession.mode : undefined}
          onEditText={canEditV2 ? editSession.stageEdit : undefined}
          isPodEditor={isPodEditor}
          isPodMember={isPodMember}
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
    );

  const chrome = (
    <>
      <div
        className={cn(
          "pointer-events-none absolute right-2 top-2 z-10 transition-opacity",
          overlayVisible
            ? "opacity-100"
            : "opacity-0 group-hover/frame:opacity-100 group-focus-within/frame:opacity-100"
        )}
      >
        <div className="pointer-events-auto flex max-w-[min(100vw-2rem,40rem)] items-center gap-0.5 overflow-x-auto rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm">
          {overlayLeading}
          {toolbar}
          {controlsPinned && (
            <Button
              variant="ghost"
              size="xs"
              label={t`Done`}
              onClick={() => setControlsPinned(false)}
            />
          )}
        </div>
      </div>
      {!overlayVisible && (
        <div className="absolute right-2 top-2 z-10 opacity-100 group-hover/frame:opacity-0 group-focus-within/frame:opacity-0 sm:hidden">
          <Button
            icon={DotsHorizontal}
            variant="ghost"
            size="xs"
            tooltip={t`Frame actions`}
            className="rounded-lg border border-border/60 bg-background/95 shadow-sm backdrop-blur-sm"
            onClick={() => setControlsPinned(true)}
          />
        </div>
      )}
      {body}
    </>
  );

  const fullscreenOverlay =
    isFullscreen &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="group/frame fixed inset-0 z-50 bg-background">
        <div className="relative h-full p-4 pt-12">
          <div className="relative h-full overflow-hidden rounded-xl">
            {chrome}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <div className={cn("group/frame relative h-full", className)}>
        {!isFullscreen && chrome}
      </div>
      {fullscreenOverlay}
    </>
  );
}
