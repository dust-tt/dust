import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useFileContent } from "@app/lib/swr/files";
import { usePodFiles } from "@app/lib/swr/pods";
import logger from "@app/logger/logger";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionPushpinIcon,
  Button,
  cn,
  EyeSlashIcon,
  FullscreenExitIcon,
  FullscreenIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const BANNER_HEIGHT_PX = 280;

const DEFAULT_POD_PINNED_BANNER_PREFERENCES = {
  collapsed: false,
} as const;

interface PodPinnedBannerProps {
  owner: WorkspaceType;
  podInfo: RichSpaceType;
}

function PodPinnedBannerFrame({
  owner,
  podId,
  fileId,
  fileContent,
  vizUrl,
}: {
  owner: WorkspaceType;
  podId: string;
  fileId: string;
  fileContent: string;
  vizUrl: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <VisualizationActionIframe
      agentConfigurationId={null}
      workspaceId={owner.sId}
      vizUrl={vizUrl}
      visualization={{
        code: fileContent,
        complete: true,
        identifier: `viz-banner-${fileId}`,
      }}
      conversationId={null}
      spaceId={podId}
      isInDrawer={true}
      ref={iframeRef}
    />
  );
}

interface PodPinnedBannerControlsProps {
  isEditor: boolean;
  isFullscreen?: boolean;
  onHide: () => void;
  onUnpin: () => void;
  onToggleFullscreen: () => void;
}

function PodPinnedBannerControls({
  isEditor,
  isFullscreen = false,
  onHide,
  onUnpin,
  onToggleFullscreen,
}: PodPinnedBannerControlsProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-2 top-2 z-10 opacity-0 transition-opacity",
        "group-hover/banner:opacity-100 group-focus-within/banner:opacity-100"
      )}
    >
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/95 p-0.5 shadow-sm backdrop-blur-sm dark:border-border-night/60 dark:bg-background-night/95">
        <Button
          icon={EyeSlashIcon}
          variant="ghost"
          size="xs"
          tooltip="Hide"
          onClick={onHide}
        />
        {isEditor && (
          <Button
            icon={ActionPushpinIcon}
            variant="ghost"
            size="xs"
            tooltip="Unpin"
            onClick={onUnpin}
          />
        )}
        <Button
          icon={isFullscreen ? FullscreenExitIcon : FullscreenIcon}
          variant="ghost"
          size="xs"
          tooltip={isFullscreen ? "Exit full screen" : "Open in full screen"}
          onClick={onToggleFullscreen}
        />
      </div>
    </div>
  );
}

interface PodPinnedBannerCollapsedAffordanceProps {
  fileName: string;
  onShow: () => void;
  onOpenFullscreen: () => void;
}

function PodPinnedBannerCollapsedAffordance({
  fileName,
  onShow,
  onOpenFullscreen,
}: PodPinnedBannerCollapsedAffordanceProps) {
  return (
    <div className="mb-2 flex min-w-0 items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
      <ActionPushpinIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0">Frame</span>
      <span aria-hidden className="shrink-0 text-muted-foreground/50">
        ·
      </span>
      <span className="min-w-0 truncate">{fileName}</span>
      <span aria-hidden className="shrink-0 text-muted-foreground/50">
        ·
      </span>
      <Button label="Show" variant="ghost" size="xs" onClick={onShow} />
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          icon={FullscreenIcon}
          variant="ghost"
          size="xs"
          tooltip="Open in full screen"
          onClick={onOpenFullscreen}
        />
      </div>
    </div>
  );
}

export function PodPinnedBanner({ owner, podInfo }: PodPinnedBannerProps) {
  const { vizUrl } = useAuth();
  const pinnedFramePath = podInfo.pinnedFramePath;

  const { value: bannerPreferences, setValue: setBannerPreferences } =
    useScopedPodUiPreferences({
      scope: "podPinnedBanner",
      resourceId: podInfo.sId,
      defaultValue: DEFAULT_POD_PINNED_BANNER_PREFERENCES,
    });
  const isCollapsed = bannerPreferences.collapsed;
  const [isFullscreen, setIsFullscreen] = useState(false);

  const showBanner = useCallback(() => {
    setBannerPreferences({ collapsed: false });
  }, [setBannerPreferences]);

  const hideBanner = useCallback(() => {
    setBannerPreferences({ collapsed: true });
  }, [setBannerPreferences]);

  const { unpinFrame } = usePinPodBanner({
    owner,
    podId: podInfo.sId,
    pinnedFramePath: podInfo.pinnedFramePath ?? null,
    isEditor: podInfo.isEditor,
  });

  const { files: podFiles, isPodFilesLoading } = usePodFiles({
    owner,
    podId: podInfo.sId,
    disabled: !pinnedFramePath,
  });

  const pinnedFile = useMemo(() => {
    if (!pinnedFramePath) {
      return null;
    }
    return (
      podFiles.find(
        (f) => !f.isDirectory && f.path === pinnedFramePath && f.fileId
      ) ?? null
    );
  }, [pinnedFramePath, podFiles]);

  const fileId =
    pinnedFile && !pinnedFile.isDirectory ? pinnedFile.fileId : null;

  useEffect(() => {
    if (
      pinnedFramePath &&
      !isPodFilesLoading &&
      podFiles.length > 0 &&
      !fileId
    ) {
      logger.warn(
        { spaceId: podInfo.sId, pinnedFramePath },
        "Pinned Pod banner file not found; skipping render."
      );
    }
  }, [
    fileId,
    isPodFilesLoading,
    pinnedFramePath,
    podFiles.length,
    podInfo.sId,
  ]);

  const { fileContent } = useFileContent({
    fileId,
    owner,
    config: { disabled: !fileId },
  });

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

  const unpinLabel =
    pinnedFile && !pinnedFile.isDirectory
      ? pinnedFile.fileName
      : pinnedFramePath;

  const handleUnpin = useCallback(() => {
    void unpinFrame({ fileName: unpinLabel ?? undefined });
  }, [unpinFrame, unpinLabel]);

  if (!pinnedFramePath) {
    return null;
  }

  if (isPodFilesLoading || (fileId && !fileContent)) {
    return (
      <div
        className="mb-4 flex h-16 items-center justify-center rounded-xl bg-muted-background dark:bg-muted-background-night"
        style={{ height: BANNER_HEIGHT_PX }}
      />
    );
  }

  if (!fileId || !fileContent || !vizUrl) {
    return null;
  }

  const frameProps = {
    owner,
    podId: podInfo.sId,
    fileId,
    fileContent,
    vizUrl,
  };

  const controlsProps = {
    isEditor: podInfo.isEditor,
    onHide: hideBanner,
    onUnpin: handleUnpin,
    onToggleFullscreen: () => setIsFullscreen((prev) => !prev),
  };

  const fullscreenOverlay =
    isFullscreen &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="group/banner fixed inset-0 z-50 bg-background dark:bg-background-night">
        <PodPinnedBannerControls
          {...controlsProps}
          isFullscreen
          onToggleFullscreen={() => setIsFullscreen(false)}
        />
        <div className="h-full p-4 pt-12">
          <div className="h-full overflow-hidden rounded-xl">
            <PodPinnedBannerFrame key={`banner-fs-${fileId}`} {...frameProps} />
          </div>
        </div>
      </div>,
      document.body
    );

  if (isCollapsed) {
    return (
      <>
        <PodPinnedBannerCollapsedAffordance
          fileName={unpinLabel ?? "Frame"}
          onShow={showBanner}
          onOpenFullscreen={() => setIsFullscreen(true)}
        />
        {fullscreenOverlay}
      </>
    );
  }

  return (
    <>
      <div
        className="group/banner relative mb-4 overflow-hidden rounded-xl bg-background ring-1 ring-border/60 dark:bg-background-night dark:ring-border-night/60"
        style={{ height: BANNER_HEIGHT_PX }}
      >
        <PodPinnedBannerControls {...controlsProps} />
        <PodPinnedBannerFrame key={`banner-${fileId}`} {...frameProps} />
      </div>
      {fullscreenOverlay}
    </>
  );
}
