import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { getFrameDisplayTitle } from "@app/components/assistant/conversation/space/frame_display_title";
import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import { useScopedUIPreferences } from "@app/hooks/useScopedUIPreferences";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useFileContent } from "@app/lib/swr/files";
import { useProjectFiles } from "@app/lib/swr/projects";
import logger from "@app/logger/logger";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  FullscreenExitIcon,
  FullscreenIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const BANNER_HEIGHT_PX = 280;

const DEFAULT_POD_PINNED_BANNER_PREFERENCES = {
  collapsed: false,
} as const;

interface PodPinnedBannerProps {
  owner: WorkspaceType;
  spaceInfo: RichSpaceType;
}

function PodPinnedBannerFrame({
  owner,
  spaceId,
  fileId,
  fileContent,
  vizUrl,
}: {
  owner: WorkspaceType;
  spaceId: string;
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
      spaceId={spaceId}
      isInDrawer={true}
      ref={iframeRef}
    />
  );
}

export function PodPinnedBanner({ owner, spaceInfo }: PodPinnedBannerProps) {
  const { vizUrl } = useAuth();
  const pinnedFramePath = spaceInfo.pinnedFramePath;

  const { value: bannerPreferences, setValue: setBannerPreferences } =
    useScopedUIPreferences({
      scope: "podPinnedBanner",
      resourceId: spaceInfo.sId,
      defaultValue: DEFAULT_POD_PINNED_BANNER_PREFERENCES,
    });
  const isCollapsed = bannerPreferences.collapsed;
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setBannerPreferences({
      collapsed: !bannerPreferences.collapsed,
    });
  }, [bannerPreferences.collapsed, setBannerPreferences]);

  const { unpinFrame } = usePinPodBanner({
    owner,
    spaceId: spaceInfo.sId,
    pinnedFramePath: spaceInfo.pinnedFramePath ?? null,
    isEditor: spaceInfo.isEditor,
  });

  const { files: projectFiles, isProjectFilesLoading } = useProjectFiles({
    owner,
    spaceId: spaceInfo.sId,
    disabled: !pinnedFramePath,
  });

  const pinnedFile = useMemo(() => {
    if (!pinnedFramePath) {
      return null;
    }
    return (
      projectFiles.find(
        (f) => !f.isDirectory && f.path === pinnedFramePath && f.fileId
      ) ?? null
    );
  }, [pinnedFramePath, projectFiles]);

  const fileId =
    pinnedFile && !pinnedFile.isDirectory ? pinnedFile.fileId : null;

  useEffect(() => {
    if (
      pinnedFramePath &&
      !isProjectFilesLoading &&
      projectFiles.length > 0 &&
      !fileId
    ) {
      logger.warn(
        { spaceId: spaceInfo.sId, pinnedFramePath },
        "Pinned Pod banner file not found; skipping render."
      );
    }
  }, [
    fileId,
    isProjectFilesLoading,
    pinnedFramePath,
    projectFiles.length,
    spaceInfo.sId,
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

  if (!pinnedFramePath) {
    return null;
  }

  if (isProjectFilesLoading || (fileId && !fileContent)) {
    return (
      <div className="mb-4 flex h-16 items-center justify-center rounded-xl bg-muted-background dark:bg-muted-background-night">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!fileId || !fileContent || !vizUrl) {
    return null;
  }

  const fileName =
    pinnedFile && !pinnedFile.isDirectory
      ? pinnedFile.fileName
      : pinnedFramePath;
  const displayTitle = getFrameDisplayTitle(fileName, fileContent);

  const frameProps = {
    owner,
    spaceId: spaceInfo.sId,
    fileId,
    fileContent,
    vizUrl,
  };

  return (
    <>
      <div className="mb-4 overflow-hidden rounded-xl ring-1 ring-border/60 dark:ring-border-night/60">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted-background/40 px-3 py-1.5 dark:border-border-night/60 dark:bg-muted-background-night/40">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground dark:text-foreground-night">
            {displayTitle}
          </span>
          <Button
            label={isCollapsed ? "Show" : "Hide"}
            variant="ghost"
            size="xs"
            onClick={toggleCollapsed}
          />
          {spaceInfo.isEditor && (
            <Button
              label="Unpin"
              variant="ghost"
              size="xs"
              onClick={() => void unpinFrame({ displayName: displayTitle })}
            />
          )}
          <Button
            icon={FullscreenIcon}
            variant="ghost"
            size="xs"
            tooltip="Open in full screen"
            onClick={() => setIsFullscreen(true)}
          />
        </div>
        {!isCollapsed && (
          <div
            className="bg-background dark:bg-background-night"
            style={{ height: BANNER_HEIGHT_PX }}
          >
            <PodPinnedBannerFrame key={`banner-${fileId}`} {...frameProps} />
          </div>
        )}
      </div>

      {isFullscreen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-background dark:bg-background-night">
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 dark:border-border-night">
              <span className="min-w-0 flex-1 truncate heading-lg">
                {displayTitle}
              </span>
              {spaceInfo.isEditor && (
                <Button
                  label="Unpin"
                  variant="ghost"
                  size="sm"
                  onClick={() => void unpinFrame({ displayName: displayTitle })}
                />
              )}
              <Button
                icon={FullscreenExitIcon}
                variant="ghost"
                size="sm"
                tooltip="Exit full screen"
                onClick={() => setIsFullscreen(false)}
              />
              <Button
                icon={XMarkIcon}
                variant="ghost"
                size="sm"
                tooltip="Close"
                onClick={() => setIsFullscreen(false)}
              />
            </div>
            <div className="min-h-0 flex-1 p-4">
              <div className={cn("h-full overflow-hidden rounded-xl")}>
                <PodPinnedBannerFrame
                  key={`banner-fs-${fileId}`}
                  {...frameProps}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
