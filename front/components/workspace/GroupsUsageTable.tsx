import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { GroupSeatPickerDropdown } from "@app/components/workspace/GroupSeatPickerDropdown";
import { GroupSpendLimitCell } from "@app/components/workspace/GroupSpendLimitCell";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import type { SeatPlanResponseBody } from "@app/lib/api/credits/seat_plan";
import { useGroups, useUpdateGroupSpendLimit } from "@app/lib/swr/groups";
import type { GroupGrantableSeatType } from "@app/types/groups";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import type { DataTableSkeletonCellProps } from "@dust-tt/sparkle";
import {
  DataTable,
  DataTableSkeleton,
  LoadingBlock,
  Users01,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

interface GroupsUsageTableProps {
  owner: LightWorkspaceType;
  showSpendLimitColumn?: boolean;
  showModelTiersColumn?: boolean;
  // When set (with `seatPlans` and `grantableSeatTypes`), renders the "Granted
  // seat" column letting an admin map each group to a billable seat tier.
  showSeatColumn?: boolean;
  seatPlans?: SeatPlanResponseBody;
  grantableSeatTypes?: GroupGrantableSeatType[];
}

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  poolCapAwuCredits: number | null;
  grantedSeatType: GroupGrantableSeatType | null;
  onClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, string>;

function GroupUsageSkeletonCell({ columnId }: DataTableSkeletonCellProps) {
  switch (columnId) {
    case "name":
      return (
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-5 w-5 shrink-0" />
          <LoadingBlock className="h-3 w-28 max-w-full" />
        </div>
      );
    case "memberCount":
      return <LoadingBlock className="h-3 w-8" />;
    case "cap":
      return <LoadingBlock className="h-8 w-60 rounded-xl" />;
    case "modelTiers":
      return <LoadingBlock className="h-8 w-48 rounded-xl" />;
    case "grantedSeat":
      return <LoadingBlock className="h-8 w-40 rounded-xl" />;
    default:
      return null;
  }
}

export function GroupsUsageTable({
  owner,
  showSpendLimitColumn = true,
  showModelTiersColumn = false,
  showSeatColumn = false,
  seatPlans,
  grantableSeatTypes,
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
        grantedSeatType: group.grantedSeatType,
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
      ...(showSeatColumn &&
      seatPlans &&
      grantableSeatTypes &&
      grantableSeatTypes.length > 0
        ? [
            {
              id: "grantedSeat",
              header: "Granted seat",
              meta: { className: "hidden @2xl:table-cell @2xl:w-56" },
              cell: (info: GroupInfo) => (
                <GroupSeatPickerDropdown
                  owner={owner}
                  groupId={info.row.original.groupId}
                  groupName={info.row.original.name}
                  memberCount={info.row.original.memberCount}
                  grantedSeatType={info.row.original.grantedSeatType}
                  grantableSeatTypes={grantableSeatTypes}
                  seatPlans={seatPlans}
                />
              ),
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
      ...(showSpendLimitColumn
        ? [
            {
              id: "cap",
              header: "Spend limit",
              meta: { className: "hidden @3xl:table-cell @3xl:w-64" },
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
              meta: { className: "hidden @2xl:table-cell @2xl:w-64" },
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
    [
      owner,
      showSpendLimitColumn,
      showModelTiersColumn,
      showSeatColumn,
      seatPlans,
      grantableSeatTypes,
      doUpdateGroupSpendLimit,
    ]
  );

  return (
    <div className="flex flex-col gap-3">
      {showSpendLimitColumn && (
        <span className="copy-sm text-muted-foreground">
          A group's monthly spend limit applies to each of its members. When a
          member belongs to several groups, the highest limit is used.
        </span>
      )}
      {isGroupsLoading ? (
        <DataTableSkeleton
          columns={columns}
          SkeletonCell={GroupUsageSkeletonCell}
          rowHeight={49}
        />
      ) : (
        <DataTable filterColumn="name" data={rows} columns={columns} />
      )}
    </div>
  );
}
