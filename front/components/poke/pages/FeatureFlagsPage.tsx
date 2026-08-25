import { FeatureFlagStageChip } from "@app/components/poke/features/stage_chip";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFeatureFlagUsage } from "@app/hooks/usePokeFeatureFlagUsage";
import type { PokeFeatureFlagUsage } from "@app/lib/api/poke/feature_flags";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import {
  FEATURE_FLAG_STAGE_LABELS,
  FEATURE_FLAG_STAGES,
} from "@app/types/shared/feature_flags";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

const LEGACY_STAGE_VALUE = "legacy";

function makeColumns(): ColumnDef<PokeFeatureFlagUsage>[] {
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
        const { globalRolloutPercentage } = row.original;
        if (globalRolloutPercentage === null) {
          return <span className="text-muted-foreground">—</span>;
        }
        return <span className="font-medium">{globalRolloutPercentage}%</span>;
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

  const { featureFlags, isLoading } = usePokeFeatureFlagUsage();

  const columns = useMemo(() => makeColumns(), []);

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
    </div>
  );
}
