import { FeatureFlagStageChip } from "@app/components/poke/features/stage_chip";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { RunPluginDialog } from "@app/components/poke/plugins/RunPluginDialog";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFeatureFlagUsage } from "@app/hooks/usePokeFeatureFlagUsage";
import type { PokeFeatureFlagUsage } from "@app/lib/api/poke/feature_flags";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeListPluginForResourceType } from "@app/poke/swr/plugins";
import type { PluginResourceTarget } from "@app/types/poke/plugins";
import {
  FEATURE_FLAG_STAGE_LABELS,
  FEATURE_FLAG_STAGES,
} from "@app/types/shared/feature_flags";
import { Button, LinkWrapper, Pencil01 } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const LEGACY_STAGE_VALUE = "legacy";

// The global plugin that sets a flag's rollout percentage, and the name of its flag argument.
const TOGGLE_GLOBAL_FEATURE_FLAG_PLUGIN_ID = "toggle-global-feature-flag";
const TOGGLE_GLOBAL_FEATURE_FLAG_ARG = "feature";

const GLOBAL_PLUGIN_TARGET: PluginResourceTarget = { resourceType: "global" };

interface MakeColumnsParams {
  // `null` when the current user cannot run the plugin that changes the rollout percentage.
  onEditGlobalRollout: ((flagName: string) => void) | null;
}

function makeColumns({
  onEditGlobalRollout,
}: MakeColumnsParams): ColumnDef<PokeFeatureFlagUsage>[] {
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
      cell: ({ row }) => <FeatureFlagStageChip stage={row.original.stage} />,
    },
    {
      accessorKey: "workspaceCount",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Workspaces" />
      ),
      cell: ({ row }) => {
        const { workspaceCount } = row.original;
        return (
          <span
            className={
              workspaceCount === 0
                ? "text-muted-foreground"
                : "font-medium text-foreground"
            }
          >
            {workspaceCount}
          </span>
        );
      },
    },
    {
      accessorKey: "globalRolloutPercentage",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Global rollout" />
      ),
      cell: ({ row }) => {
        const { globalRolloutPercentage, name, stage } = row.original;
        const label =
          globalRolloutPercentage === null
            ? "—"
            : `${globalRolloutPercentage}%`;

        // Legacy flags are not in the plugin's list of features, so there is nothing to open.
        if (!onEditGlobalRollout || stage === null) {
          return <span className="text-muted-foreground">{label}</span>;
        }

        return (
          <Button
            variant="ghost"
            size="xs"
            icon={Pencil01}
            label={label}
            tooltip="Set the global rollout percentage"
            onClick={() => onEditGlobalRollout(name)}
          />
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
  ];
}

export function FeatureFlagsPage() {
  usePokePageMetadata({ name: "Feature Flags" });

  const { featureFlags, isLoading, mutate } = usePokeFeatureFlagUsage();

  const { plugins } = usePokeListPluginForResourceType({
    pluginResourceTarget: GLOBAL_PLUGIN_TARGET,
  });
  const togglePlugin = plugins.find(
    (plugin) => plugin.id === TOGGLE_GLOBAL_FEATURE_FLAG_PLUGIN_ID
  );

  const [flagBeingEdited, setFlagBeingEdited] = useState<string | null>(null);

  const onEditGlobalRollout = useCallback(
    (flagName: string) => setFlagBeingEdited(flagName),
    []
  );

  const handlePluginDialogClose = useCallback(() => {
    setFlagBeingEdited(null);
    void mutate();
  }, [mutate]);

  const columns = useMemo(
    () =>
      makeColumns({
        onEditGlobalRollout: togglePlugin ? onEditGlobalRollout : null,
      }),
    [onEditGlobalRollout, togglePlugin]
  );

  // The table starts unsorted, so the most-used flags come first by default.
  const sortedFeatureFlags = useMemo(
    () => [...featureFlags].sort((a, b) => b.workspaceCount - a.workspaceCount),
    [featureFlags]
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every feature flag in this region, with the number of workspaces it is
          enabled on. Click a flag to see those workspaces.
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

      {togglePlugin && flagBeingEdited && (
        <RunPluginDialog
          initialValues={{
            [TOGGLE_GLOBAL_FEATURE_FLAG_ARG]: [flagBeingEdited],
          }}
          onClose={handlePluginDialogClose}
          plugin={togglePlugin}
          pluginResourceTarget={GLOBAL_PLUGIN_TARGET}
        />
      )}
    </div>
  );
}
