import { PodHoverFrameViewer } from "@app/components/pod/PodHoverFrameViewer";
import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { useScopedPodUiPreferences } from "@app/hooks/useScopedUIPreferences";
import { useAuth } from "@app/lib/auth/AuthContext";
import logger from "@app/logger/logger";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { WorkspaceType } from "@app/types/user";
import { Button, EyeOff, Maximize01, Pin02 } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

const BANNER_HEIGHT_PX = 280;

const DEFAULT_POD_PINNED_BANNER_PREFERENCES = {
  collapsed: false,
} as const;

interface PodPinnedBannerProps {
  owner: WorkspaceType;
  podInfo: RichSpaceType;
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
  const { t } = useLingui();
  return (
    <div className="mb-2 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      <Pin02 className="h-3.5 w-3.5 shrink-0" />
      <span className="shrink-0">
        <Trans>Frame</Trans>
      </span>
      <span aria-hidden className="shrink-0 text-muted-foreground/50">
        ·
      </span>
      <span className="min-w-0 truncate">{fileName}</span>
      <span aria-hidden className="shrink-0 text-muted-foreground/50">
        ·
      </span>
      <Button label={t`Show`} variant="ghost" size="xs" onClick={onShow} />
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          icon={Maximize01}
          variant="ghost"
          size="xs"
          tooltip={t`Open in full screen`}
          onClick={onOpenFullscreen}
        />
      </div>
    </div>
  );
}

export function PodPinnedBanner({ owner, podInfo }: PodPinnedBannerProps) {
  const { t } = useLingui();
  const { vizUrl } = useAuth();
  const pinnedFramePath = podInfo.pinnedFramePath;

  const { value: bannerPreferences, setValue: setBannerPreferences } =
    useScopedPodUiPreferences({
      scope: "podPinnedBanner",
      resourceId: podInfo.sId,
      defaultValue: DEFAULT_POD_PINNED_BANNER_PREFERENCES,
    });
  const isCollapsed = bannerPreferences.collapsed;
  const [startFullscreen, setStartFullscreen] = useState(false);

  const showBanner = useCallback(() => {
    setBannerPreferences({ collapsed: false });
  }, [setBannerPreferences]);

  const hideBanner = useCallback(() => {
    setBannerPreferences({ collapsed: true });
    setStartFullscreen(false);
  }, [setBannerPreferences]);

  const { unpinFrame } = usePinPodBanner({
    owner,
    podId: podInfo.sId,
    pinnedFramePath: podInfo.pinnedFramePath ?? null,
    isEditor: podInfo.isEditor,
  });

  const { fileId, fileContent, fileContentType, isLoading, isNotFound } =
    usePodFrameRenderableContent({
      owner,
      framePath: pinnedFramePath,
      disabled: !pinnedFramePath,
    });

  useEffect(() => {
    if (pinnedFramePath && isNotFound) {
      logger.warn(
        { spaceId: podInfo.sId, pinnedFramePath },
        "Pinned Pod banner file not found; skipping render."
      );
    }
  }, [isNotFound, pinnedFramePath, podInfo.sId]);

  const unpinLabel =
    pinnedFramePath?.split("/").pop() ?? pinnedFramePath ?? undefined;

  const handleUnpin = useCallback(() => {
    void unpinFrame({ fileName: unpinLabel });
  }, [unpinFrame, unpinLabel]);

  if (!pinnedFramePath) {
    return null;
  }

  if (isLoading) {
    return (
      <div
        className="mb-4 flex h-16 items-center justify-center rounded-xl bg-muted-background"
        style={{ height: BANNER_HEIGHT_PX }}
      />
    );
  }

  if (isNotFound || !fileId || !fileContent || !vizUrl) {
    return null;
  }

  const frameId =
    getFrameFunctionReferenceKind(fileContentType) === "v2"
      ? fileId
      : undefined;

  if (isCollapsed) {
    return (
      <PodPinnedBannerCollapsedAffordance
        fileName={unpinLabel ?? t`Frame`}
        onShow={showBanner}
        onOpenFullscreen={() => {
          setStartFullscreen(true);
          showBanner();
        }}
      />
    );
  }

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-xl bg-background ring-1 ring-border/60"
      style={{ height: BANNER_HEIGHT_PX }}
    >
      <PodHoverFrameViewer
        key={`banner-${fileId}`}
        owner={owner}
        spaceId={podInfo.sId}
        fileId={fileId}
        fileContent={fileContent}
        vizUrl={vizUrl}
        identifier={`viz-banner-${fileId}`}
        isPodEditor={podInfo.isEditor}
        isPodMember={podInfo.isMember}
        frameId={frameId}
        framePath={pinnedFramePath}
        fileName={unpinLabel}
        contentType={fileContentType ?? undefined}
        pinnedFramePath={podInfo.pinnedFramePath ?? null}
        fileTabs={podInfo.frameTabs ?? []}
        tabsOrder={podInfo.tabsOrder ?? []}
        isArchived={Boolean(podInfo.archivedAt)}
        initialFullscreen={startFullscreen}
        overlayLeading={
          <>
            <Button
              icon={EyeOff}
              variant="ghost"
              size="xs"
              tooltip={t`Hide`}
              onClick={hideBanner}
            />
            {podInfo.isEditor && (
              <Button
                icon={Pin02}
                variant="ghost"
                size="xs"
                tooltip={t`Unpin`}
                onClick={handleUnpin}
              />
            )}
          </>
        }
      />
    </div>
  );
}
