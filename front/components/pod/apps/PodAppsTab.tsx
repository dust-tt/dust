import { ClonePodAppDialog } from "@app/components/pod/apps/ClonePodAppDialog";
import { DeletePodAppDialog } from "@app/components/pod/apps/DeletePodAppDialog";
import { PodAppTile } from "@app/components/pod/apps/PodAppTile";
import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { usePodApps } from "@app/lib/swr/pods";
import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import { DEFAULT_POD_FRAME_TAB_ICON } from "@app/types/pod_frame_tab";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  CardGrid,
  ContentMessage,
  ScrollArea,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface PodAppsTabProps {
  owner: WorkspaceType;
  pod: PodType;
}

// NavTabPillContent is a bare Radix Tabs.Content with no forceMount, so this only mounts while the
// Apps tab is active — hence no `disabled` flag on the hook below.
export function PodAppsTab({ owner, pod }: PodAppsTabProps) {
  const { apps, isPodAppsLoading, isPodAppsError } = usePodApps({
    owner,
    podId: pod.sId,
  });

  const canEdit = pod.isEditor && !pod.archivedAt;

  const [framePreview, setFramePreview] = useState<PodAppFrame | null>(null);
  const [appPendingDeletion, setAppPendingDeletion] = useState<PodApp | null>(
    null
  );
  const [appPendingClone, setAppPendingClone] = useState<PodApp | null>(null);

  const iconByFramePath = useMemo(
    () =>
      new Map<string, CustomResourceIconType>(
        (pod.frameTabs ?? []).map((tab) => [tab.path, tab.icon])
      ),
    [pod.frameTabs]
  );

  if (isPodAppsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isPodAppsError) {
    return (
      <div className="px-6 py-8">
        <ContentMessage variant="warning" title="Could not load apps">
          Something went wrong while listing this Pod's apps. Try reloading the
          page.
        </ContentMessage>
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 py-8">
        <p className="max-w-md text-center copy-sm text-muted-foreground dark:text-muted-foreground-night">
          No app in this Pod yet. Ask an agent in this Pod to build one — a
          Frame with the functions and databases behind it — and it will show up
          here.
        </p>
      </div>
    );
  }

  const collidingApps = apps.filter(
    (app) => app.collidingFolderNames.length > 0
  );

  return (
    <div className="h-full min-h-0 w-full flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-4 px-6 py-5">
          {collidingApps.map((app) => (
            <ContentMessage
              key={app.prefix}
              variant="warning"
              title="Colliding app folders"
            >
              {app.collidingFolderNames.join(", ")} all resolve to the same app
              name (<span className="font-mono">{app.prefix}</span>), so they
              share the same published functions and databases. Rename all but
              one, then re-publish its functions.
            </ContentMessage>
          ))}

          <CardGrid>
            {apps.map((app) => (
              <PodAppTile
                key={app.prefix}
                app={app}
                iconByFramePath={iconByFramePath}
                defaultIcon={DEFAULT_POD_FRAME_TAB_ICON}
                onOpenFrame={setFramePreview}
                onClone={canEdit ? () => setAppPendingClone(app) : undefined}
                onDelete={
                  canEdit ? () => setAppPendingDeletion(app) : undefined
                }
              />
            ))}
          </CardGrid>
        </div>
      </ScrollArea>

      {appPendingClone && (
        <ClonePodAppDialog
          key={`clone-${appPendingClone.prefix}`}
          owner={owner}
          podId={pod.sId}
          app={appPendingClone}
          existingPrefixes={apps.map((candidate) => candidate.prefix)}
          isOpen
          onClose={() => setAppPendingClone(null)}
        />
      )}

      {appPendingDeletion && (
        <DeletePodAppDialog
          key={appPendingDeletion.prefix}
          owner={owner}
          podId={pod.sId}
          app={appPendingDeletion}
          isOpen
          onClose={() => setAppPendingDeletion(null)}
        />
      )}

      <PodFrameSheet
        owner={owner}
        fileId={framePreview?.fileId ?? null}
        framePath={framePreview?.path ?? null}
        fileName={framePreview?.fileName}
        podId={pod.sId}
        pinnedFramePath={pod.pinnedFramePath ?? null}
        frameTabs={pod.frameTabs ?? []}
        tabsOrder={pod.tabsOrder ?? []}
        isEditor={pod.isEditor}
        isArchived={!!pod.archivedAt}
        isOpen={framePreview !== null}
        onClose={() => setFramePreview(null)}
      />
    </div>
  );
}
