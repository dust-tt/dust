import { buildMemberNameColumn } from "@app/components/workspace/member_name_column";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { UserModelTierSelection } from "@app/lib/client/model_tier_options";
import {
  getUserModelTierMenuItemsWithSelection,
  INHERIT_MODEL_TIER,
  toUserModelTierSelection,
} from "@app/lib/client/model_tier_options";
import {
  formatModelTiersSummary,
  formatUserModelTierInheritLabel,
  resolveModelTiersForUser,
} from "@app/lib/client/model_tiers";
import { getMaxTierName } from "@app/lib/model_tiers/tier_order";
import {
  DataTable,
  LoadingBlock,
  type MenuItem,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
} from "@tanstack/react-table";
import { useMemo } from "react";

type RowData = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  groups: string[];
  modelTiersSummary: string;
  hasUserLevelModelTiersOverride: boolean;
  menuItems: MenuItem[];
};

type Info = CellContext<RowData, string>;

const nameColumn = buildMemberNameColumn<RowData>();

const groupsColumn: ColumnDef<RowData, string> = {
  id: "groups" as const,
  header: "Groups",
  enableSorting: false,
  accessorFn: (row) => row.groups.join(", "),
  cell: (info: Info) => (
    <DataTable.CellContent>
      <span className="text-sm text-muted-foreground">
        {info.row.original.groups.length > 0
          ? info.row.original.groups.join(", ")
          : "--"}
      </span>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-48",
  },
};

const modelTiersColumn: ColumnDef<RowData, string> = {
  id: "modelTiers" as const,
  header: "Models tier",
  enableSorting: false,
  accessorFn: (row) => row.modelTiersSummary,
  cell: (info: Info) => {
    const customSuffix = info.row.original.hasUserLevelModelTiersOverride
      ? " (custom)"
      : "";

    return (
      <DataTable.CellContent>
        <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {info.row.original.modelTiersSummary}
          {customSuffix}
        </span>
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "w-48",
  },
};

const actionsColumn: ColumnDef<RowData, string> = {
  id: "actions" as const,
  header: "",
  enableSorting: false,
  accessorKey: "actions",
  cell: (info: Info) => (
    <div
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <DataTable.MoreButton menuItems={info.row.original.menuItems} />
    </div>
  ),
  meta: {
    className: "w-14",
  },
};

const columns: ColumnDef<RowData, string>[] = [
  nameColumn,
  groupsColumn,
  modelTiersColumn,
  actionsColumn,
];

interface AllowedModelsMembersTableProps {
  members: MemberUsageType[];
  isLoading: boolean;
  isRefreshing?: boolean;
  readOnly: boolean;
  userModelTierSelectionByUserId: Record<string, UserModelTierSelection>;
  userAllowedModelTiersByUserId: Record<string, ModelsTierName[]>;
  groupModelTiersByGroupId: Record<string, ModelsTierName[]>;
  workspaceAllowedModelTiers: ModelsTierName[];
  groupNameToId: Map<string, string>;
  onSetUserModelTier: (
    member: MemberUsageType,
    selection: UserModelTierSelection
  ) => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  totalRowCount: number;
}

export function AllowedModelsMembersTable({
  members,
  isLoading,
  isRefreshing = false,
  readOnly,
  userModelTierSelectionByUserId,
  userAllowedModelTiersByUserId,
  groupModelTiersByGroupId,
  workspaceAllowedModelTiers,
  groupNameToId,
  onSetUserModelTier,
  pagination,
  setPagination,
  totalRowCount,
}: AllowedModelsMembersTableProps) {
  const rows: RowData[] = useMemo(
    () =>
      members.map((m) => {
        const resolvedModelTiers = resolveModelTiersForUser({
          userId: m.sId,
          groupNames: m.groups,
          groupNameToId,
          userAllowedTierNamesByUserId: userAllowedModelTiersByUserId,
          groupTierNamesByGroupId: groupModelTiersByGroupId,
          workspaceAllowedTierNames: workspaceAllowedModelTiers,
        });

        return {
          sId: m.sId,
          name: m.name,
          email: m.email,
          image: m.image,
          groups: m.groups,
          modelTiersSummary: formatModelTiersSummary(
            getMaxTierName(resolvedModelTiers.tiers)
          ),
          hasUserLevelModelTiersOverride: resolvedModelTiers.source === "user",
          menuItems: [
            {
              kind: "submenu" as const,
              label: "Models tier",
              disabled: readOnly,
              selectionMode: "checkbox" as const,
              items: getUserModelTierMenuItemsWithSelection({
                selectedValue:
                  userModelTierSelectionByUserId[m.sId] ?? INHERIT_MODEL_TIER,
                inheritLabel: formatUserModelTierInheritLabel({
                  groupNames: m.groups,
                  groupNameToId,
                  groupTierNamesByGroupId: groupModelTiersByGroupId,
                  workspaceAllowedTierNames: workspaceAllowedModelTiers,
                }),
              }).map((tierItem) => ({
                id: tierItem.id,
                name: tierItem.name,
                description: tierItem.description,
                checked: tierItem.checked,
              })),
              onSelect: (itemId: string) =>
                onSetUserModelTier(m, toUserModelTierSelection(itemId)),
            },
          ],
        };
      }),
    [
      members,
      readOnly,
      userModelTierSelectionByUserId,
      userAllowedModelTiersByUserId,
      groupModelTiersByGroupId,
      workspaceAllowedModelTiers,
      groupNameToId,
      onSetUserModelTier,
    ]
  );

  if (isLoading) {
    return (
      <div className="flex w-full flex-col space-y-2">
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
        <LoadingBlock className="h-8 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={
          isRefreshing
            ? "pointer-events-none opacity-50 transition-opacity"
            : "transition-opacity"
        }
      >
        <DataTable
          data={rows}
          columns={columns}
          pagination={pagination}
          setPagination={setPagination}
          totalRowCount={totalRowCount}
          getRowId={(row) => row.sId}
        />
      </div>
      {isRefreshing && (
        <div className="absolute inset-x-0 top-16 flex justify-center">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}
