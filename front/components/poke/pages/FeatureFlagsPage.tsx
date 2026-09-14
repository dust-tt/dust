import { FeatureFlagStageChip } from "@app/components/poke/features/stage_chip";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { RunPluginDialog } from "@app/components/poke/plugins/RunPluginDialog";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeFeatureFlagUsageAllCells } from "@app/hooks/usePokeFeatureFlagUsage";
import { usePokeFeatureFlagUsageAllCells } from "@app/hooks/usePokeFeatureFlagUsage";
import { useCellContext } from "@app/lib/auth/CellContext";
import { getCellChipColor, getCellDisplay } from "@app/lib/poke/cells";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeListPluginForResourceType } from "@app/poke/swr/plugins";
import type { CellType } from "@app/types/cell";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import {
  FEATURE_FLAG_STAGE_LABELS,
  FEATURE_FLAG_STAGES,
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES_CONFIG,
} from "@app/types/shared/feature_flags";
import { Button, Chip, LinkWrapper, Pencil01, Trash01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const LEGACY_STAGE_VALUE = "legacy";

// The global plugins acting on a single flag. Both name their flag argument `feature`.
const TOGGLE_GLOBAL_ROLLOUT_PLUGIN_ID = "toggle-global-feature-flag";
const DELETE_LEGACY_FLAG_PLUGIN_ID = "delete-legacy-feature-flag";
const FEATURE_FLAG_PLUGIN_ARG = "feature";

const GLOBAL_PLUGIN_TARGET: PluginResourceTarget = { resourceType: "global" };

interface PendingPluginAction {
  pluginId: string;
  flagName: string;
  cell: CellType;
}

interface MakeColumnsParams {
  // Both are `null` when the current user cannot run the corresponding plugin.
  onDeleteLegacyRows: ((flagName: string, cell: CellType) => void) | null;
  onEditGlobalRollout: ((flagName: string, cell: CellType) => void) | null;
}

function makeColumns({
  onDeleteLegacyRows,
  onEditGlobalRollout,
}: MakeColumnsParams): ColumnDef<PokeFeatureFlagUsageAllCells>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Flag" />
      ),
      cell: ({ row }) => (
        <LinkWrapper href={`/poke/feature-flags/${row.original.name}`}>
          <span className="font-mono text-sm text-highlight-600 hover:underline">
            {row.original.name}
          </span>
        </LinkWrapper>
      ),
    },
    {
      id: "stage",
      accessorFn: (flag) => flag.stage ?? LEGACY_STAGE_VALUE,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Stage" />
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      cell: ({ row }) => <FeatureFlagStageChip flagName={row.original.name} />,
    },
    {
      id: "owner",
      accessorFn: (flag) =>
        isWhitelistableFeature(flag.name)
          ? WHITELISTABLE_FEATURES_CONFIG[flag.name].owner
          : null,
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Owner" />
      ),
      cell: ({ row }) => {
        const owner = row.getValue<string | null>("owner");
        if (!owner) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <a
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-highlight-600 hover:underline"
          >
            @{owner}
          </a>
        );
      },
    },
    {
      accessorKey: "totalWorkspaceCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Workspaces" />
      ),
      cell: ({ row }) => {
        const { byCell, totalWorkspaceCount } = row.original;
        return (
          <div className="flex flex-col gap-1">
            <span
              className={
                totalWorkspaceCount === 0
                  ? "text-muted-foreground"
                  : "font-medium text-foreground"
              }
            >
              {totalWorkspaceCount} total
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {byCell.map((stat) => (
                <Chip
                  key={stat.cell}
                  size="mini"
                  color={getCellChipColor(stat.region)}
                  label={`${getCellDisplay({ name: stat.cell, region: stat.region })}: ${stat.workspaceCount}`}
                />
              ))}
            </div>
          </div>
        );
      },
    },
    {
      id: "globalRollout",
      accessorFn: (flag) =>
        flag.byCell.reduce(
          (max, stat) => Math.max(max, stat.globalRolloutPercentage ?? -1),
          -1
        ),
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Global rollout" />
      ),
      cell: ({ row }) => {
        const { byCell, name, stage } = row.original;

        // Legacy flags are not in the plugin's list of features, so there is nothing to open.
        if (!onEditGlobalRollout || stage === null) {
          return (
            <div className="flex flex-wrap items-center gap-1">
              {byCell.map((stat) => {
                const label =
                  stat.globalRolloutPercentage === null
                    ? "—"
                    : `${stat.globalRolloutPercentage}%`;
                return (
                  <Chip
                    key={stat.cell}
                    size="mini"
                    color={getCellChipColor(stat.region)}
                    label={`${getCellDisplay({ name: stat.cell, region: stat.region })}: ${label}`}
                  />
                );
              })}
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-1">
            {byCell.map((stat) => {
              const label =
                stat.globalRolloutPercentage === null
                  ? "—"
                  : `${stat.globalRolloutPercentage}%`;
              return (
                <div key={stat.cell} className="flex items-center gap-1">
                  <Chip
                    size="mini"
                    color={getCellChipColor(stat.region)}
                    label={getCellDisplay({
                      name: stat.cell,
                      region: stat.region,
                    })}
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Pencil01}
                    label={label}
                    tooltip="Set the global rollout percentage"
                    onClick={() => onEditGlobalRollout(name, stat.cell)}
                  />
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.description ??
            "No longer declared in WHITELISTABLE_FEATURES_CONFIG."}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const { name, stage, byCell } = row.original;

        // Only leftover rows are deleted wholesale; a flag that still exists is turned off per
        // workspace, or globally, through the toggle plugins.
        if (stage !== null || !onDeleteLegacyRows) {
          return null;
        }

        const deletable = byCell.filter((stat) => stat.workspaceCount > 0);
        if (deletable.length === 0) {
          return null;
        }

        return (
          <div className="flex flex-col gap-1">
            {deletable.map((stat) => (
              <div key={stat.cell} className="flex items-center gap-1">
                <Chip
                  size="mini"
                  color={getCellChipColor(stat.region)}
                  label={getCellDisplay({
                    name: stat.cell,
                    region: stat.region,
                  })}
                />
                <Button
                  variant="warning"
                  size="xs"
                  icon={Trash01}
                  label="Delete rows"
                  tooltip="Delete every row for this retired flag"
                  onClick={() => onDeleteLegacyRows(name, stat.cell)}
                />
              </div>
            ))}
          </div>
        );
      },
    },
  ];
}

export function FeatureFlagsPage() {
  usePokePageMetadata({ name: "Feature Flags" });

  const { cells, cellInfo, setCellInfo } = useCellContext();
  const { featureFlags, isLoading, mutate } = usePokeFeatureFlagUsageAllCells();

  const { plugins } = usePokeListPluginForResourceType({
    pluginResourceTarget: GLOBAL_PLUGIN_TARGET,
  });
  const rolloutPlugin = plugins.find(
    (plugin) => plugin.id === TOGGLE_GLOBAL_ROLLOUT_PLUGIN_ID
  );
  const deleteLegacyPlugin = plugins.find(
    (plugin) => plugin.id === DELETE_LEGACY_FLAG_PLUGIN_ID
  );

  const [pendingAction, setPendingAction] =
    useState<PendingPluginAction | null>(null);

  const switchToCell = useCallback(
    (cell: CellType) => {
      const targetCell = cells.find((c) => c.name === cell);
      if (targetCell && targetCell.name !== cellInfo.name) {
        setCellInfo(targetCell);
      }
    },
    [cells, cellInfo, setCellInfo]
  );

  const onEditGlobalRollout = useCallback(
    (flagName: string, cell: CellType) => {
      switchToCell(cell);
      setPendingAction({
        pluginId: TOGGLE_GLOBAL_ROLLOUT_PLUGIN_ID,
        flagName,
        cell,
      });
    },
    [switchToCell]
  );

  const onDeleteLegacyRows = useCallback(
    (flagName: string, cell: CellType) => {
      switchToCell(cell);
      setPendingAction({
        pluginId: DELETE_LEGACY_FLAG_PLUGIN_ID,
        flagName,
        cell,
      });
    },
    [switchToCell]
  );

  const handlePluginDialogClose = useCallback(() => {
    setPendingAction(null);
    void mutate();
  }, [mutate]);

  const columns = useMemo(
    () =>
      makeColumns({
        onDeleteLegacyRows: deleteLegacyPlugin ? onDeleteLegacyRows : null,
        onEditGlobalRollout: rolloutPlugin ? onEditGlobalRollout : null,
      }),
    [deleteLegacyPlugin, onDeleteLegacyRows, onEditGlobalRollout, rolloutPlugin]
  );

  const pendingPlugin = pendingAction
    ? plugins.find((plugin) => plugin.id === pendingAction.pluginId)
    : undefined;

  // Most-used flags across all cells come first by default.
  const sortedFeatureFlags = useMemo(
    () =>
      [...featureFlags].sort(
        (a, b) => b.totalWorkspaceCount - a.totalWorkspaceCount
      ),
    [featureFlags]
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every feature flag across all cells, with the number of workspaces it
          is enabled on. Click a flag to see those workspaces.
        </p>
      </div>

      <PokeDataTable
        columns={columns}
        data={sortedFeatureFlags}
        isLoading={isLoading}
        pageSize={50}
        facets={[
          {
            columnId: "stage",
            title: "Stage",
            options: [
              ...FEATURE_FLAG_STAGES.map((stage) => ({
                label: FEATURE_FLAG_STAGE_LABELS[stage],
                value: stage,
              })),
              { label: "Legacy", value: LEGACY_STAGE_VALUE },
            ],
          },
        ]}
      />

      {pendingAction && pendingPlugin && (
        <RunPluginDialog
          initialValues={{
            [FEATURE_FLAG_PLUGIN_ARG]: [pendingAction.flagName],
          }}
          onClose={handlePluginDialogClose}
          plugin={pendingPlugin}
          pluginResourceTarget={GLOBAL_PLUGIN_TARGET}
        />
      )}
    </div>
  );
}
