import { DeletePodAppDialog } from "@app/components/pod/apps/DeletePodAppDialog";
import { PodAppDetail } from "@app/components/pod/apps/PodAppDetail";
import { PodAppList } from "@app/components/pod/apps/PodAppList";
import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import { usePodApps } from "@app/lib/swr/pods";
import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import { UNFILED_POD_APP_PREFIX } from "@app/types/api/pod_apps";
import { DEFAULT_POD_FRAME_TAB_ICON } from "@app/types/pod_frame_tab";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { ContentMessage, Spinner } from "@dust-tt/sparkle";
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

  const canDelete = pod.isEditor && !pod.archivedAt;

  const [selectedPrefix, setSelectedPrefix] = useState<string | null>(null);
  const [framePreview, setFramePreview] = useState<PodAppFrame | null>(null);
  const [appPendingDeletion, setAppPendingDeletion] = useState<PodApp | null>(
    null
  );

  const iconByFramePath = useMemo(
    () =>
      new Map<string, CustomResourceIconType>(
        (pod.frameTabs ?? []).map((tab) => [tab.path, tab.icon])
      ),
    [pod.frameTabs]
  );

  // Selection follows the list until the user picks something, so the detail pane is never blank and
  // a refresh that drops the selected app falls back rather than showing nothing.
  const selectedApp =
    apps.find((app) => app.prefix === selectedPrefix) ?? apps[0] ?? null;

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

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden">
      <div className="w-72 min-w-56 shrink-0 border-r border-border dark:border-border-night">
        <PodAppList
          apps={apps}
          selectedPrefix={selectedApp?.prefix ?? null}
          onSelect={setSelectedPrefix}
          iconByFramePath={iconByFramePath}
          defaultIcon={DEFAULT_POD_FRAME_TAB_ICON}
        />
      </div>
      <div className="min-w-0 flex-1">
        {selectedApp && (
          <PodAppDetail
            app={selectedApp}
            onOpenFrame={setFramePreview}
            // The unfiled app is a presentation device, not a folder, so there is nothing
            // coherent to delete.
            onDelete={
              canDelete && selectedApp.prefix !== UNFILED_POD_APP_PREFIX
                ? () => setAppPendingDeletion(selectedApp)
                : undefined
            }
          />
        )}
      </div>

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
