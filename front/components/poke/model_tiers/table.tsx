import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeMemberModelTier } from "@app/lib/api/poke/model_tiers";
import type { ModelTierResolutionSource } from "@app/lib/model_tiers/resolve_allowed";
import { getTierIndex } from "@app/lib/model_tiers/tier_order";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getModelsTierDisplayName,
  MODELS_TIER_NAMES,
} from "@app/types/assistant/models/model_tiers";
import type { LightWorkspaceType } from "@app/types/user";
import { LinkWrapper } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

const SOURCE_LABELS: Record<ModelTierResolutionSource, string> = {
  user: "User override",
  groups: "Group override",
  workspace: "Workspace default",
};

const NO_TIER = "none";

type DisplayTier = ModelsTierName | typeof NO_TIER;

const TIER_FILTER_VALUES: DisplayTier[] = [...MODELS_TIER_NAMES, NO_TIER];

type MemberModelTierDisplayType = {
  sId: string;
  name: string;
  email: string;
  tier: DisplayTier;
  groups: PokeMemberModelTier["groups"];
  groupNames: string;
  source: ModelTierResolutionSource;
  sourceGroupIds: string[];
};

function prepareForDisplay(
  members: PokeMemberModelTier[]
): MemberModelTierDisplayType[] {
  return members.map((m) => ({
    sId: m.member.sId,
    name: m.member.fullName,
    email: m.member.email,
    tier: m.maxTierName ?? NO_TIER,
    groups: m.groups,
    groupNames: m.groups.map(({ group }) => group.name).join(", "),
    source: m.source,
    sourceGroupIds: m.sourceGroupIds,
  }));
}

function formatTier(tier: DisplayTier): string {
  return tier === NO_TIER ? "None" : getModelsTierDisplayName(tier);
}

function makeColumns(
  owner: LightWorkspaceType
): ColumnDef<MemberModelTierDisplayType>[] {
  const groupLink = (sId: string, name: string) => (
    <LinkWrapper
      key={sId}
      href={`/poke/${owner.sId}/groups/${sId}`}
      className="text-highlight-500"
    >
      {name}
    </LinkWrapper>
  );

  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Name" />
      ),
    },
    {
      accessorKey: "email",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Email" />
      ),
    },
    {
      accessorKey: "tier",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Model tier" />
      ),
      sortingFn: (a, b) =>
        (a.original.tier === NO_TIER ? -1 : getTierIndex(a.original.tier)) -
        (b.original.tier === NO_TIER ? -1 : getTierIndex(b.original.tier)),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      cell: ({ row }) => formatTier(row.original.tier),
    },
    {
      // Kept as a joined string so the global search matches group names.
      accessorKey: "groupNames",
      header: "Groups",
      cell: ({ row }) => {
        const { groups } = row.original;
        if (groups.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {groups.map(({ group, maxTierName }) => (
              <span key={group.sId}>
                {groupLink(group.sId, group.name)}
                {maxTierName && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({getModelsTierDisplayName(maxTierName)})
                  </span>
                )}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "source",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Inherited from" />
      ),
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      cell: ({ row }) => {
        const { source, groups, sourceGroupIds } = row.original;
        if (source !== "groups") {
          return SOURCE_LABELS[source];
        }
        const sourceGroups = groups.filter(({ group }) =>
          sourceGroupIds.includes(group.sId)
        );
        return (
          <div className="flex flex-wrap gap-x-1">
            <span>{SOURCE_LABELS[source]}:</span>
            {sourceGroups.map(({ group }) => groupLink(group.sId, group.name))}
          </div>
        );
      },
    },
  ];
}

interface MemberModelTiersDataTableProps {
  members: PokeMemberModelTier[];
  owner: LightWorkspaceType;
}

export function MemberModelTiersDataTable({
  members,
  owner,
}: MemberModelTiersDataTableProps) {
  return (
    <PokeDataTable
      columns={makeColumns(owner)}
      data={prepareForDisplay(members)}
      getRowId={(row) => row.sId}
      pageSize={50}
      facets={[
        {
          columnId: "tier",
          title: "Model tier",
          options: TIER_FILTER_VALUES.map((tier) => ({
            label: formatTier(tier),
            value: tier,
          })),
        },
        {
          columnId: "source",
          title: "Inherited from",
          options: Object.entries(SOURCE_LABELS).map(([value, label]) => ({
            label,
            value,
          })),
        },
      ]}
    />
  );
}
