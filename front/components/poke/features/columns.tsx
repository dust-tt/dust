import { FeatureFlagStageChip } from "@app/components/poke/features/stage_chip";
import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import type {
  FeatureFlagStage,
  WhitelistableFeature,
} from "@app/types/shared/feature_flags";
import { getFeatureFlagOwner } from "@app/types/shared/feature_flags";
import { dateToHumanReadable } from "@app/types/shared/utils/date_utils";
import type { ColumnDef } from "@tanstack/react-table";

type FeatureFlagsDisplayType = {
  name: WhitelistableFeature;
  description: string;
  stage: FeatureFlagStage;
  enabled: boolean;
  enabledAt: string | null;
};

export function makeColumnsForFeatureFlags(): ColumnDef<FeatureFlagsDisplayType>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
    },
    {
      accessorKey: "stage",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Stage" />
      ),
      cell: ({ row }) => (
        <FeatureFlagStageChip
          stage={row.original.stage}
          owner={getFeatureFlagOwner(row.original.name)}
        />
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => {
        return (
          <span className="text-sm text-primary-600">
            {row.original.description}
          </span>
        );
      },
    },
    {
      accessorKey: "enabled",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
      cell: ({ row }) => {
        const { enabled } = row.original;
        return (
          <span
            className={`font-medium ${enabled ? "text-green-600" : "text-gray-400"}`}
          >
            {enabled ? "✅ Enabled" : "❌ Disabled"}
          </span>
        );
      },
    },
    {
      accessorKey: "enabledAt",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Enabled date" />
      ),
      cell: ({ row }) => {
        const { enabledAt } = row.original;
        if (!enabledAt) {
          return <span className="text-gray-400">—</span>;
        }

        try {
          const date = new Date(enabledAt);
          return <span className="text-sm">{dateToHumanReadable(date)}</span>;
        } catch {
          return <span className="text-gray-400">Invalid date</span>;
        }
      },
    },
  ];
}
