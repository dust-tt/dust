import { FeatureFlagStageChip } from "@app/components/poke/features/stage_chip";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFeatureFlagWorkspaces } from "@app/hooks/usePokeFeatureFlagWorkspaces";
import type { PokeFeatureFlagWorkspace } from "@app/lib/api/poke/feature_flags";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

function makeColumns(): ColumnDef<PokeFeatureFlagWorkspace>[] {
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
  } = usePokeFeatureFlagWorkspaces({ flagName });

  // Description and stage are static config, so they need no round trip. A flag name that is not
  // in the config is a legacy row still present in the database.
  const flagConfig = isWhitelistableFeature(flagName)
    ? WHITELISTABLE_FEATURES_CONFIG[flagName]
    : null;

  const columns = useMemo(() => makeColumns(), []);

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
    </div>
  );
}
