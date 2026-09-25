import {
  Button,
  Chip,
  createSelectionColumn,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchInput,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useState } from "react";

import {
  type BlockedReason,
  describePerMemberLimitSource,
  formatCreditAmount,
  getBlockedReason,
  getGroupLimitUser,
  getMemberGroups,
  getMemberIds,
  getMemberLimitedGroups,
  getMemberPoolSpend,
  getPerMemberLimit,
  getSeatAllowance,
  type GroupLimitPlan,
  type GroupLimitsState,
  resolveLimitGroup,
} from "../data/groupLimits";
import { BulkSelectionBar } from "./BulkSelectionBar";
import { LimitGroupChip, UsageBar } from "./GroupLimitShared";

interface MemberRow {
  userId: string;
  name: string;
  email: string;
  portrait?: string;
  plan: GroupLimitPlan;
  limitGroupName: string | null;
  limitGroupIsDefault: boolean;
  otherGroupNames: string[];
  poolSpend: number;
  perMemberLimit: number;
  perMemberLimitSource: string;
  seatLabel: string;
  seatUsed: number;
  seatAllowance: number;
  blocked: BlockedReason | null;
  canMove: boolean;
  onClick: () => void;
  onEditGroupLimit: (groupId: string) => void;
  onMoveLimitGroup: () => void;
  onChangeSeat: () => void;
}

function UnblockCell({ row }: { row: MemberRow }) {
  const { blocked } = row;
  if (!blocked) {
    return null;
  }
  return (
    <div
      className="flex w-full items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="min-w-0 flex-1 text-xs text-warning">
        {blocked.kind === "groupLimit"
          ? `Blocked by ${blocked.group.name}'s group limit`
          : "Blocked by limit per member"}
      </span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="highlight" size="xs" label="Unblock" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {blocked.kind === "groupLimit" ? (
            <>
              <DropdownMenuItem
                label={`Raise ${blocked.group.name}'s group limit`}
                description="Unblocks everyone drawing from it"
                onClick={() => row.onEditGroupLimit(blocked.group.id)}
              />
              <DropdownMenuItem
                label="Move to another limit group"
                description={
                  row.canMove
                    ? "Starts at 0 in the new group"
                    : "Not in another group with a group limit"
                }
                disabled={!row.canMove}
                onClick={row.onMoveLimitGroup}
              />
            </>
          ) : (
            <DropdownMenuItem
              label="Edit personal limit"
              description="Raise this member's limit"
              onClick={row.onClick}
            />
          )}
          {row.plan === "seats" && (
            <DropdownMenuItem
              label="Change seat"
              description="More seat allowance before drawing from the pool"
              onClick={row.onChangeSeat}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const memberColumn: ColumnDef<MemberRow, string> = {
  id: "name",
  accessorFn: (row) => row.name,
  header: "Member",
  cell: ({ row }) => (
    <DataTable.CellContent
      avatarUrl={row.original.portrait}
      roundedAvatar
      secondaryLine={row.original.email}
    >
      {row.original.name}
    </DataTable.CellContent>
  ),
};

const groupsColumn: ColumnDef<MemberRow, string> = {
  id: "groups",
  header: "Groups",
  meta: { className: "w-60" },
  cell: ({ row }) => {
    const r = row.original;
    if (!r.limitGroupName && r.otherGroupNames.length === 0) {
      return <DataTable.BasicCellContent label="—" />;
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-2">
        {r.limitGroupName && (
          <Tooltip
            tooltipTriggerAsChild
            label={
              r.limitGroupIsDefault
                ? `Limit group: ${r.limitGroupName} (default: group with a group limit joined first)`
                : `Limit group: ${r.limitGroupName}`
            }
            trigger={
              <span>
                <LimitGroupChip
                  name={r.limitGroupName}
                  isDefault={r.limitGroupIsDefault}
                />
              </span>
            }
          />
        )}
        {r.otherGroupNames.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {r.otherGroupNames.join(", ")}
          </span>
        )}
      </div>
    );
  },
};

const poolUsageColumn: ColumnDef<MemberRow, string> = {
  id: "poolUsage",
  header: "Pool usage",
  meta: { className: "w-48" },
  cell: ({ row }) => (
    <Tooltip
      tooltipTriggerAsChild
      label={`Limit per member: ${formatCreditAmount(row.original.perMemberLimit)} credits/month (${row.original.perMemberLimitSource})`}
      trigger={
        <div className="w-full py-2">
          <UsageBar
            used={row.original.poolSpend}
            limit={row.original.perMemberLimit}
            label="Member pool usage"
          />
        </div>
      }
    />
  ),
};

const seatColumn: ColumnDef<MemberRow, string> = {
  id: "seat",
  header: "Seat",
  meta: { className: "w-36" },
  cell: ({ row }) => (
    <div className="flex items-center gap-2">
      <Chip
        size="mini"
        color={row.original.seatLabel === "Max" ? "warning" : "highlight"}
        label={row.original.seatLabel}
      />
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatCreditAmount(row.original.seatUsed)} /{" "}
        {formatCreditAmount(row.original.seatAllowance)}
      </span>
    </div>
  ),
};

const statusColumn: ColumnDef<MemberRow, string> = {
  id: "status",
  header: "",
  meta: { className: "w-72" },
  cell: ({ row }) => <UnblockCell row={row.original} />,
};

const pooledColumns = [
  createSelectionColumn<MemberRow>() as ColumnDef<MemberRow, string>,
  memberColumn,
  groupsColumn,
  poolUsageColumn,
  statusColumn,
];
const seatColumns = [
  createSelectionColumn<MemberRow>() as ColumnDef<MemberRow, string>,
  memberColumn,
  groupsColumn,
  seatColumn,
  poolUsageColumn,
  statusColumn,
];

interface GroupLimitMembersTabProps {
  state: GroupLimitsState;
  plan: GroupLimitPlan;
  rowSelection: RowSelectionState;
  setRowSelection: (selection: RowSelectionState) => void;
  onOpenMember: (userId: string, focusLimitGroup?: boolean) => void;
  onEditGroupLimit: (groupId: string) => void;
  onChangeSeat: (userId: string) => void;
  onBulkSetLimitGroup: (userIds: string[]) => void;
}

export function GroupLimitMembersTab({
  state,
  plan,
  rowSelection,
  setRowSelection,
  onOpenMember,
  onEditGroupLimit,
  onChangeSeat,
  onBulkSetLimitGroup,
}: GroupLimitMembersTabProps) {
  const [filter, setFilter] = useState("");

  const rows: MemberRow[] = getMemberIds(state).map((userId) => {
    const user = getGroupLimitUser(userId);
    const member = state.members[userId];
    const limitGroup = resolveLimitGroup(state, userId);
    const perMember = getPerMemberLimit(state, userId);
    return {
      userId,
      name: user.fullName,
      email: user.email,
      portrait: user.portrait,
      plan,
      limitGroupName: limitGroup?.group.name ?? null,
      limitGroupIsDefault:
        limitGroup?.source === "default" &&
        getMemberLimitedGroups(state, userId).length > 1,
      otherGroupNames: getMemberGroups(state, userId)
        .filter((g) => g.id !== limitGroup?.group.id)
        .map((g) => g.name),
      poolSpend: getMemberPoolSpend(state, userId),
      perMemberLimit: perMember.value,
      perMemberLimitSource: describePerMemberLimitSource(perMember.source),
      seatLabel: member.seat === "max" ? "Max" : "Pro",
      seatUsed: member.seatUsed,
      seatAllowance: getSeatAllowance(member, plan),
      blocked: getBlockedReason(state, userId, plan),
      canMove: getMemberLimitedGroups(state, userId).length > 1,
      onClick: () => onOpenMember(userId),
      onEditGroupLimit,
      onMoveLimitGroup: () => onOpenMember(userId, true),
      onChangeSeat: () => onChangeSeat(userId),
    };
  });
  const selectedIds = Object.keys(rowSelection).filter(
    (id) => rowSelection[id]
  );
  const blockedCount = rows.filter((r) => r.blocked).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <SearchInput
          name="member-search"
          placeholder="Search members"
          value={filter}
          onChange={setFilter}
          className="max-w-xs"
        />
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.length} members · {blockedCount} blocked
        </span>
      </div>
      <DataTable
        data={rows}
        columns={plan === "seats" ? seatColumns : pooledColumns}
        filter={filter}
        filterColumn="name"
        getRowId={(row) => row.userId}
        getRowLabel={(row) => row.name}
        enableRowSelection
        disableRowClickSelection
        density="relaxed"
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
      />
      <BulkSelectionBar
        selectedCount={selectedIds.length}
        totalCount={rows.length}
        itemLabel="member"
        canSelectAll={selectedIds.length < rows.length}
        onSelectAll={() =>
          setRowSelection(Object.fromEntries(rows.map((r) => [r.userId, true])))
        }
        onClear={() => setRowSelection({})}
      >
        <Button
          size="sm"
          variant="highlight"
          label="Set limit group"
          onClick={() => onBulkSetLimitGroup(selectedIds)}
        />
      </BulkSelectionBar>
    </div>
  );
}
