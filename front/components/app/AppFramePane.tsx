import { PodFrameVisualization } from "@app/components/pod/PodFrameVisualization";
import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { useAuth } from "@app/lib/auth/AuthContext";
import { usePodApps } from "@app/lib/swr/pods";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  LinkExternal01,
  RefreshCcw01,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface AppFramePaneProps {
  owner: WorkspaceType;
  app: RichSpaceType;
}

/**
 * The running App.
 *
 * One App per Pod and one Frame per App, so this renders the App's first renderable Frame — the
 * same assumption `PodAppTile` makes. If the agent produced extra Frames or folders they are kept,
 * but they stay reachable only from the Pod UI.
 */
export function AppFramePane({ owner, app }: AppFramePaneProps) {
  const { vizUrl } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { apps, isPodAppsLoading, mutatePodApps } = usePodApps({
    owner,
    podId: app.sId,
  });

  const frame = apps[0]?.frames.find((candidate) => candidate.fileId) ?? null;

  const {
    fileId,
    fileContent,
    isLoading: isFrameLoading,
    mutateFrameContent,
  } = usePodFrameRenderableContent({ owner, framePath: frame?.path });

  // A rebuilt Frame keeps its path and fileId, so the app list alone would serve the cached bundle.
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([mutatePodApps(), mutateFrameContent()]);
    setIsRefreshing(false);
  }, [mutatePodApps, mutateFrameContent]);

  let body;
  if (isPodAppsLoading || isFrameLoading) {
    body = (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (!frame || !fileContent || !vizUrl) {
    body = (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="copy-base text-muted-foreground dark:text-muted-foreground-night">
          Your App will appear here.
        </p>
        <p className="max-w-sm copy-sm text-muted-foreground dark:text-muted-foreground-night">
          Describe what you want to build on the left. The running App shows up
          as soon as it is built.
        </p>
      </div>
    );
  } else {
    body = (
      <PodFrameVisualization
        owner={owner}
        spaceId={app.sId}
        fileContent={fileContent}
        vizUrl={vizUrl}
        identifier={`viz-app-${fileId}`}
        isPodEditor={app.isEditor}
        isPodMember={app.isMember}
        framePath={frame.path}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2 p-2">
      <div className="flex flex-shrink-0 items-center justify-end gap-1">
        <Button
          size="xs"
          variant="ghost"
          icon={RefreshCcw01}
          tooltip="Reload the App"
          isLoading={isRefreshing}
          onClick={() => void onRefresh()}
        />
        {fileId && (
          <Button
            size="xs"
            variant="ghost"
            icon={LinkExternal01}
            tooltip="Open in a new tab"
            href={`/api/w/${owner.sId}/files/${fileId}?action=view`}
            target="_blank"
          />
        )}
      </div>
      <div className="h-full min-h-0 overflow-hidden rounded-xl bg-background ring-1 ring-border/60 dark:bg-background-night">
        {body}
      </div>
    </div>
  );
}
