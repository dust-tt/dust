import { FeatureFlagStageChip } from "@app/components/poke/features/stage_chip";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { RunPluginDialog } from "@app/components/poke/plugins/RunPluginDialog";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFeatureFlagWorkspaces } from "@app/hooks/usePokeFeatureFlagWorkspaces";
import type { PokeFeatureFlagWorkspace } from "@app/lib/api/poke/feature_flags";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeListPluginForResourceType } from "@app/poke/swr/plugins";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  LinkWrapper,
  Pencil01,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

// The workspace-scoped plugin that turns feature flags on and off for one workspace.
const TOGGLE_FEATURE_FLAG_PLUGIN_ID = "toggle-feature-flag";

interface WorkspaceTogglePluginDialogProps {
  onClose: () => void;
  workspaceId: string;
}

/**
 * Opens the workspace's Toggle Feature Flag plugin. The available plugins depend on the workspace
 * (maintenance mode, per-plugin applicability), so the list is fetched once the workspace is
 * known rather than upfront for the whole table.
 *
 * The plugin is deliberately opened without prefilled arguments: it takes the full set of flags
 * the workspace should end up with and disables everything left unchecked, and its own async
 * arguments already check exactly the flags the workspace has today.
 */
function WorkspaceTogglePluginDialog({
  onClose,
  workspaceId,
}: WorkspaceTogglePluginDialogProps) {
  const pluginResourceTarget = useMemo<PluginResourceTarget>(
    () => ({
      resourceType: "workspaces",
      resourceId: workspaceId,
      workspace: { sId: workspaceId },
    }),
    [workspaceId]
  );

  const { plugins, isLoading } = usePokeListPluginForResourceType({
    pluginResourceTarget,
  });

  const togglePlugin = plugins.find(
    (plugin) => plugin.id === TOGGLE_FEATURE_FLAG_PLUGIN_ID
  );

  if (togglePlugin) {
    return (
      <RunPluginDialog
        onClose={onClose}
        plugin={togglePlugin}
        pluginResourceTarget={pluginResourceTarget}
      />
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-muted-background">
        <DialogHeader>
          <DialogTitle>Toggle Feature Flag plugin</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center px-5 py-8">
          {isLoading ? (
            <Spinner />
          ) : (
            <p className="text-sm text-muted-foreground">
              The plugin is not available for this workspace.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface MakeColumnsParams {
  onToggleFlags: (workspaceId: string) => void;
}

function makeColumns({
  onToggleFlags,
}: MakeColumnsParams): ColumnDef<PokeFeatureFlagWorkspace>[] {
  return [
    {
      accessorKey: "workspaceName",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Workspace" />
      ),
      cell: ({ row }) => (
        <LinkWrapper href={`/poke/${row.original.workspaceId}`}>
          <span className="text-highlight-600 hover:underline">
            {row.original.workspaceName}
          </span>
        </LinkWrapper>
      ),
    },
    {
      accessorKey: "workspaceId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Workspace ID" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.workspaceId}
        </span>
      ),
    },
    {
      accessorKey: "planCode",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Plan" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.planCode}</span>
      ),
    },
    {
      accessorKey: "enabledAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Enabled at" />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm">
          {dateToHumanReadable(new Date(row.original.enabledAt))}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="xs"
          icon={Pencil01}
          label="Toggle flags"
          tooltip="Open this workspace's Toggle Feature Flag plugin"
          onClick={() => onToggleFlags(row.original.workspaceId)}
        />
      ),
    },
  ];
}

export function FeatureFlagDetailPage() {
  const flagName = useRequiredPathParam("flagName");

  usePokePageMetadata({ name: flagName });

  const {
    workspaces,
    totalCount,
    globalRolloutPercentage,
    isLoading,
    isError,
    mutate,
  } = usePokeFeatureFlagWorkspaces({ flagName });

  // Description and stage are static config, so they need no round trip. A flag name that is not
  // in the config is a legacy row still present in the database.
  const flagConfig = isWhitelistableFeature(flagName)
    ? WHITELISTABLE_FEATURES_CONFIG[flagName]
    : null;

  const [workspaceBeingEdited, setWorkspaceBeingEdited] = useState<
    string | null
  >(null);

  const onToggleFlags = useCallback(
    (workspaceId: string) => setWorkspaceBeingEdited(workspaceId),
    []
  );

  const handlePluginDialogClose = useCallback(() => {
    setWorkspaceBeingEdited(null);
    void mutate();
  }, [mutate]);

  const columns = useMemo(
    () => makeColumns({ onToggleFlags }),
    [onToggleFlags]
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <LinkWrapper href="/poke/feature-flags">
          <span className="text-sm text-highlight-600 hover:underline">
            ← All feature flags
          </span>
        </LinkWrapper>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">{flagName}</h1>
          <FeatureFlagStageChip stage={flagConfig?.stage ?? null} />
          {globalRolloutPercentage !== null && (
            <span className="text-sm text-muted-foreground">
              global rollout: {globalRolloutPercentage}%
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {flagConfig?.description ??
            "No longer declared in WHITELISTABLE_FEATURES_CONFIG."}
        </p>
      </div>

      {isError ? (
        <p className="text-sm text-warning-600">
          Could not load the workspaces for this feature flag.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {workspaces.length === totalCount
              ? `${totalCount} workspace(s)`
              : `Showing the ${workspaces.length} most recently enabled of ${totalCount} workspaces.`}
          </p>
          <PokeDataTable
            columns={columns}
            data={workspaces}
            isLoading={isLoading}
            pageSize={50}
          />
        </>
      )}

      {workspaceBeingEdited && (
        <WorkspaceTogglePluginDialog
          onClose={handlePluginDialogClose}
          workspaceId={workspaceBeingEdited}
        />
      )}
    </div>
  );
}
