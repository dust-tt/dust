import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { GroupSpendLimitCell } from "@app/components/workspace/GroupSpendLimitCell";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import { useGroups, useUpdateGroupSpendLimit } from "@app/lib/swr/groups";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { DataTable, Spinner, Users01 } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

interface GroupsUsageTableProps {
  owner: LightWorkspaceType;
  showSpendLimitColumn?: boolean;
  showModelTiersColumn?: boolean;
}

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  poolCapAwuCredits: number | null;
  onClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, string>;

export function GroupsUsageTable({
  owner,
  showSpendLimitColumn = true,
  showModelTiersColumn = false,
}: GroupsUsageTableProps) {
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
  });
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });

  const rows: GroupRowData[] = useMemo(
    () =>
      groups.map((group) => ({
        groupId: group.sId,
        name: group.name,
        memberCount: group.memberCount,
        poolCapAwuCredits: group.poolCapAwuCredits,
      })),
    [groups]
  );

  const columns: ColumnDef<GroupRowData, string>[] = useMemo(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: "Group",
        cell: (info: GroupInfo) => (
          <DataTable.CellContent icon={Users01} className="capitalize">
            {info.row.original.name}
          </DataTable.CellContent>
        ),
        enableSorting: true,
      },
      {
        id: "memberCount",
        accessorFn: (row) => String(row.memberCount),
        header: "Members",
        meta: { className: "w-[120px]" },
        cell: (info: GroupInfo) => (
          <DataTable.BasicCellContent
            label={`${info.row.original.memberCount}`}
          />
        ),
        enableSorting: false,
      },
      ...(showSpendLimitColumn
        ? [
            {
              id: "cap",
              header: "Spend limit",
              meta: { className: "w-64" },
              cell: (info: GroupInfo) => (
                <GroupSpendLimitCell
                  group={info.row.original}
                  onSave={async (group, limit) => {
                    await doUpdateGroupSpendLimit({
                      groupId: group.groupId,
                      groupName: group.name,
                      limit,
                    });
                  }}
                />
              ),
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
      ...(showModelTiersColumn
        ? [
            {
              id: "modelTiers",
              header: () => (
                <span className="flex items-center gap-1">
                  Models tier
                  <ModelTiersInfoButton />
                </span>
              ),
              meta: { className: "w-64" },
              cell: (info: GroupInfo) => (
                <GroupModelTierPickerDropdown
                  owner={owner}
                  groupId={info.row.original.groupId}
                />
              ),
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
    ],
    [owner, showSpendLimitColumn, showModelTiersColumn, doUpdateGroupSpendLimit]
  );

  if (isGroupsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showSpendLimitColumn && (
        <span className="copy-sm text-muted-foreground">
          A group's monthly spend limit applies to each of its members. When a
          member belongs to several groups, the highest limit is used.
        </span>
      )}
      <DataTable
        filterColumn="name"
        data={rows}
        columns={columns}
        columnsBreakpoints={{ name: "md" }}
      />
    </div>
  );
}
