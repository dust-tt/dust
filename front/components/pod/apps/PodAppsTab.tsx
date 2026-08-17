import { ClonePodAppDialog } from "@app/components/pod/apps/ClonePodAppDialog";
import { DeletePodAppDialog } from "@app/components/pod/apps/DeletePodAppDialog";
import { ImportPodAppDialog } from "@app/components/pod/apps/ImportPodAppDialog";
import { PendingPodAppTile } from "@app/components/pod/apps/PendingPodAppTile";
import { PodAppImportReportDialog } from "@app/components/pod/apps/PodAppImportReportDialog";
import { PodAppTile } from "@app/components/pod/apps/PodAppTile";
import { SharePodAppDialog } from "@app/components/pod/apps/SharePodAppDialog";
import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import type { CustomResourceIconType } from "@app/components/resources/resources_icon_names";
import {
  useClonePodApp,
  useDeletePodApp,
  useDownloadPodApp,
  useImportPodApp,
  usePodApps,
} from "@app/lib/swr/pods";
import type { PodAppImportSummary } from "@app/types/api/pod_app_archive";
import type { PodApp, PodAppFrame } from "@app/types/api/pod_apps";
import { normalizeAppPrefix } from "@app/types/api/pod_function_reference";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  CardGrid,
  ContentMessage,
  ScrollArea,
  Spinner,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

interface PodAppsTabProps {
  owner: WorkspaceType;
  pod: PodType;
}

/**
 * An app being created by a clone or an import. Both rebuild every function on the Pod's Computer,
 * so they run long after their dialog is gone and need a tile of their own in the meantime.
 */
interface PendingPodAppCreation {
  id: number;
  kind: "clone" | "import";
  name: string;
  /** Null for an import that lets the archive name the app: the prefix is only known server-side. */
  prefix: string | null;
}

/** A tile on the grid: an app that exists, or one still being created. */
type PodAppGridEntry =
  | { kind: "app"; key: string; name: string; app: PodApp }
  | {
      kind: "pending";
      key: string;
      name: string;
      creation: PendingPodAppCreation;
    };

// Not DEFAULT_POD_FRAME_TAB_ICON (a gauge that reads as a clock at tile size): an app is a Frame,
// so the fallback is the Frame glyph.
const DEFAULT_POD_APP_ICON = "ActionFrameIcon" satisfies CustomResourceIconType;

// NavTabPillContent is a bare Radix Tabs.Content with no forceMount, so this only mounts while the
// Apps tab is active — hence no `disabled` flag on the hook below.
export function PodAppsTab({ owner, pod }: PodAppsTabProps) {
  const { apps, isPodAppsLoading, isPodAppsError } = usePodApps({
    owner,
    podId: pod.sId,
  });

  const canEdit = pod.isEditor && !pod.archivedAt;
  const downloadPodApp = useDownloadPodApp({ owner, podId: pod.sId });
  const clonePodApp = useClonePodApp({ owner, podId: pod.sId });
  const importPodApp = useImportPodApp({ owner, podId: pod.sId });
  const deletePodApp = useDeletePodApp({ owner, podId: pod.sId });

  const [framePreview, setFramePreview] = useState<PodAppFrame | null>(null);
  const [appPendingDeletion, setAppPendingDeletion] = useState<PodApp | null>(
    null
  );
  const [appPendingClone, setAppPendingClone] = useState<PodApp | null>(null);
  const [appPendingShare, setAppPendingShare] = useState<PodApp | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importReport, setImportReport] = useState<PodAppImportSummary | null>(
    null
  );

  // Clones and imports are long enough to overlap, so each in-flight one gets its own tile.
  const [pendingCreations, setPendingCreations] = useState<
    PendingPodAppCreation[]
  >([]);
  const [deletingPrefixes, setDeletingPrefixes] = useState<string[]>([]);
  const nextPendingCreationIdRef = useRef(0);

  const iconByFramePath = useMemo(
    () =>
      new Map<string, CustomResourceIconType>(
        (pod.frameTabs ?? []).map((tab) => [tab.path, tab.icon])
      ),
    [pod.frameTabs]
  );

  const deletingPrefixSet = useMemo(
    () => new Set(deletingPrefixes),
    [deletingPrefixes]
  );

  // Names taken by an existing app or by a creation still running, so two concurrent clones cannot
  // both claim the same prefix.
  const existingPrefixes = useMemo(
    () => [
      ...apps.map((app) => app.prefix),
      ...pendingCreations.flatMap((creation) =>
        creation.prefix ? [creation.prefix] : []
      ),
    ],
    [apps, pendingCreations]
  );

  const runCreation = useCallback(
    async (
      creation: Omit<PendingPodAppCreation, "id">,
      run: () => Promise<void>
    ) => {
      const id = nextPendingCreationIdRef.current++;
      setPendingCreations((creations) => [...creations, { ...creation, id }]);
      await run();
      setPendingCreations((creations) =>
        creations.filter((candidate) => candidate.id !== id)
      );
    },
    []
  );

  const onClone = useCallback(
    async (app: PodApp, name: string) => {
      setAppPendingClone(null);
      await runCreation(
        { kind: "clone", name, prefix: normalizeAppPrefix(name) },
        async () => {
          await clonePodApp(app, name);
        }
      );
    },
    [clonePodApp, runCreation]
  );

  const onImport = useCallback(
    async (file: File, name: string | undefined) => {
      setIsImportOpen(false);
      await runCreation(
        {
          kind: "import",
          name: name ?? file.name,
          prefix: name ? normalizeAppPrefix(name) : null,
        },
        async () => {
          const result = await importPodApp(file, name);
          if (
            result.isOk() &&
            (result.value.warnings.length > 0 ||
              result.value.skipped.length > 0)
          ) {
            setImportReport(result.value);
          }
        }
      );
    },
    [importPodApp, runCreation]
  );

  const onDelete = useCallback(
    async (app: PodApp) => {
      setAppPendingDeletion(null);
      setDeletingPrefixes((prefixes) => [...prefixes, app.prefix]);
      await deletePodApp(app);
      setDeletingPrefixes((prefixes) =>
        prefixes.filter((prefix) => prefix !== app.prefix)
      );
    },
    [deletePodApp]
  );

  const importButton = canEdit && (
    <div className="flex justify-end">
      <Button
        label="Import app"
        variant="outline"
        size="sm"
        onClick={() => setIsImportOpen(true)}
      />
    </div>
  );

  const collidingApps = apps.filter(
    (app) => app.collidingFolderNames.length > 0
  );

  // Sorted by name like `listPodApps` does, so a pending tile already sits where its app will land
  // and the grid does not reshuffle when the real tile replaces it. An import that lets the archive
  // name the app is ordered on its file name, so that one can still move.
  const gridEntries = useMemo(() => {
    const entries: PodAppGridEntry[] = [
      ...apps.map((app) => ({
        kind: "app" as const,
        key: app.prefix,
        name: app.name,
        app,
      })),
      ...pendingCreations.map((creation) => ({
        kind: "pending" as const,
        key: `pending-${creation.id}`,
        name: creation.name,
        creation,
      })),
    ];

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [apps, pendingCreations]);

  let body: ReactNode;
  if (isPodAppsLoading) {
    body = (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (isPodAppsError) {
    body = (
      <div className="px-6 py-8">
        <ContentMessage variant="warning" title="Could not load apps">
          Something went wrong while listing this Pod's apps. Try reloading the
          page.
        </ContentMessage>
      </div>
    );
  } else if (apps.length === 0 && pendingCreations.length === 0) {
    body = (
      <div className="flex h-full w-full flex-col gap-4 px-6 py-8">
        {importButton}
        <div className="flex flex-1 items-center justify-center">
          <p className="max-w-md text-center copy-sm text-muted-foreground dark:text-muted-foreground-night">
            No app in this Pod yet. Ask an agent in this Pod to build one — a
            Frame with the functions and databases behind it — and it will show
            up here.
          </p>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="h-full min-h-0 w-full flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 px-6 py-5">
            {importButton}
            {collidingApps.map((app) => (
              <ContentMessage
                key={app.prefix}
                variant="warning"
                title="Colliding app folders"
              >
                {app.collidingFolderNames.join(", ")} all resolve to the same
                app name (<span className="font-mono">{app.prefix}</span>), so
                they share the same published functions and databases. Rename
                all but one, then re-publish its functions.
              </ContentMessage>
            ))}

            <CardGrid>
              {gridEntries.map((entry) => {
                switch (entry.kind) {
                  case "app":
                    return (
                      <PodAppTile
                        key={entry.key}
                        app={entry.app}
                        iconByFramePath={iconByFramePath}
                        defaultIcon={DEFAULT_POD_APP_ICON}
                        onOpenFrame={setFramePreview}
                        onDownload={() => downloadPodApp(entry.app)}
                        onClone={
                          canEdit
                            ? () => setAppPendingClone(entry.app)
                            : undefined
                        }
                        onDelete={
                          canEdit
                            ? () => setAppPendingDeletion(entry.app)
                            : undefined
                        }
                        onShare={
                          canEdit
                            ? () => setAppPendingShare(entry.app)
                            : undefined
                        }
                        isDeleting={deletingPrefixSet.has(entry.app.prefix)}
                      />
                    );
                  case "pending":
                    return (
                      <PendingPodAppTile
                        key={entry.key}
                        name={entry.name}
                        kind={entry.creation.kind}
                      />
                    );
                  default:
                    assertNeverAndIgnore(entry);
                    return null;
                }
              })}
            </CardGrid>
          </div>
        </ScrollArea>

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
          isMember={pod.isMember}
          isArchived={!!pod.archivedAt}
          isOpen={framePreview !== null}
          onClose={() => setFramePreview(null)}
        />
      </div>
    );
  }

  // The dialogs sit outside `body` so a mutation that flips which branch renders (the first import
  // into an empty Pod, the deletion of the last app) cannot unmount them mid-edit.
  return (
    <>
      {body}
      {appPendingClone && (
        <ClonePodAppDialog
          key={`clone-${appPendingClone.prefix}`}
          app={appPendingClone}
          existingPrefixes={existingPrefixes}
          isOpen
          onClose={() => setAppPendingClone(null)}
          onSubmit={(name) => void onClone(appPendingClone, name)}
        />
      )}
      {appPendingDeletion && (
        <DeletePodAppDialog
          key={appPendingDeletion.prefix}
          app={appPendingDeletion}
          isOpen
          onClose={() => setAppPendingDeletion(null)}
          onSubmit={() => void onDelete(appPendingDeletion)}
        />
      )}
      {appPendingShare && (
        <SharePodAppDialog
          key={`share-${appPendingShare.prefix}`}
          owner={owner}
          podId={pod.sId}
          app={appPendingShare}
          isOpen
          onClose={() => setAppPendingShare(null)}
        />
      )}
      {isImportOpen && (
        <ImportPodAppDialog
          existingPrefixes={existingPrefixes}
          isOpen
          onClose={() => setIsImportOpen(false)}
          onSubmit={(file, name) => void onImport(file, name)}
        />
      )}
      {importReport && (
        <PodAppImportReportDialog
          report={importReport}
          onClose={() => setImportReport(null)}
        />
      )}
    </>
  );
}
