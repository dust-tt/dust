import {
  Button,
  DataTable,
  Hoverable,
  InputWithSave,
  type MenuItem,
  Plus,
  Users01,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import {
  formatCreditAmount,
  getDrawingMemberIds,
  getGroupMemberIds,
  getGroupMembersPoolSpend,
  getGroupUsage,
  type GroupLimitsState,
} from "../data/groupLimits";
import { UsageBar } from "./GroupLimitShared";

interface GroupRow {
  id: string;
  name: string;
  kind: string;
  memberCount: number;
  drawingCount: number;
  perMemberLimit: number | null;
  groupLimit: number | null;
  used: number;
  membersPoolSpend: number;
  menuItems: MenuItem[];
  onSavePerMemberLimit: (value: number | null) => void;
  onEditGroupLimit: () => void;
  onAddGroupLimit: () => void;
  onShowMembers: () => void;
}

// Module scope: the table renders each `cell` as a component type, so a new
// identity per render would remount the inputs and drop focus.
const columns: ColumnDef<GroupRow, string>[] = [
  {
    id: "name",
    accessorFn: (row) => row.name,
    header: "Group",
    cell: ({ row }) => (
      <DataTable.CellContent
        icon={Users01}
        description={
          row.original.kind === "provisioned" ? "Provisioned" : "Manual"
        }
      >
        {row.original.name}
      </DataTable.CellContent>
    ),
  },
  {
    id: "memberCount",
    accessorFn: (row) => String(row.memberCount),
    header: "Members",
    meta: { className: "w-28" },
    cell: ({ row }) => (
      <DataTable.BasicCellContent label={row.original.memberCount} />
    ),
  },
  {
    id: "perMemberLimit",
    header: "Limit per member",
    meta: { className: "w-64" },
    cell: ({ row }) => (
      <div
        className="w-56"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <InputWithSave
          inputMode="numeric"
          placeholder="No limit"
          value={
            row.original.perMemberLimit === null
              ? ""
              : row.original.perMemberLimit.toLocaleString("en-US")
          }
          unit="credits/month"
          normalizeValue={(value) => value.replace(/[^\d]/g, "")}
          formatValue={(value) =>
            value ? Number(value).toLocaleString("en-US") : value
          }
          onSave={(value) => {
            const cleaned = value.replace(/[^\d]/g, "");
            row.original.onSavePerMemberLimit(
              cleaned === "" ? null : Number(cleaned)
            );
          }}
        />
      </div>
    ),
  },
  {
    id: "groupLimit",
    header: "Group limit",
    meta: { className: "w-72" },
    cell: ({ row }) => {
      const r = row.original;
      if (r.groupLimit === null) {
        return (
          <div className="flex w-full items-center gap-2 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-foreground">No limit</span>
              <span className="text-xs text-muted-foreground">
                {formatCreditAmount(r.membersPoolSpend)} credits used by members
                this cycle
              </span>
            </div>
            <Button
              size="xs"
              variant="ghost"
              icon={Plus}
              label="Add"
              tooltip="Add a group limit"
              onClick={(e) => {
                e.stopPropagation();
                r.onAddGroupLimit();
              }}
            />
          </div>
        );
      }
      return (
        <div className="flex w-full flex-col gap-0.5 py-2">
          <button
            type="button"
            className="w-full rounded-md text-left hover:opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              r.onEditGroupLimit();
            }}
            aria-label={`Edit ${r.name}'s group limit`}
          >
            <UsageBar
              used={r.used}
              limit={r.groupLimit}
              label={`${r.name} group limit`}
            />
          </button>
          <span
            className="text-xs text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Hoverable variant="highlight" onClick={r.onShowMembers}>
              {r.drawingCount} of {r.memberCount} members draw from it
            </Hoverable>
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "",
    meta: { type: "row-actions" },
    cell: ({ row }) => (
      <DataTable.MoreButton menuItems={row.original.menuItems} />
    ),
  },
];

interface GroupLimitGroupsTabProps {
  state: GroupLimitsState;
  onSavePerMemberLimit: (groupId: string, value: number | null) => void;
  onAddGroupLimit: (groupId: string) => void;
  onEditGroupLimit: (groupId: string) => void;
  onRemoveGroupLimit: (groupId: string) => void;
  onShowMembers: (groupId: string) => void;
}

export function GroupLimitGroupsTab({
  state,
  onSavePerMemberLimit,
  onAddGroupLimit,
  onEditGroupLimit,
  onRemoveGroupLimit,
  onShowMembers,
}: GroupLimitGroupsTabProps) {
  const rows: GroupRow[] = state.groups.map((g) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    memberCount: getGroupMemberIds(state, g.id).length,
    drawingCount: getDrawingMemberIds(state, g.id).length,
    perMemberLimit: g.perMemberLimit,
    groupLimit: g.groupLimit,
    used: getGroupUsage(state, g.id),
    membersPoolSpend: getGroupMembersPoolSpend(state, g.id),
    onSavePerMemberLimit: (value) => onSavePerMemberLimit(g.id, value),
    onEditGroupLimit: () => onEditGroupLimit(g.id),
    onAddGroupLimit: () => onAddGroupLimit(g.id),
    onShowMembers: () => onShowMembers(g.id),
    menuItems:
      g.groupLimit === null
        ? [
            {
              kind: "item",
              label: "Add group limit",
              onClick: () => onAddGroupLimit(g.id),
            },
          ]
        : [
            {
              kind: "item",
              label: "Edit group limit",
              onClick: () => onEditGroupLimit(g.id),
            },
            {
              kind: "item",
              label: "See who draws from this group",
              onClick: () => onShowMembers(g.id),
            },
            {
              kind: "item",
              label: "Remove group limit",
              variant: "warning",
              onClick: () => onRemoveGroupLimit(g.id),
            },
          ],
  }));

  return (
    <div className="flex flex-col gap-3">
      <span className="copy-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Limit per member</span>{" "}
        applies to each member of a group.{" "}
        <span className="font-semibold text-foreground">Group limit</span> caps
        what the members drawing from a group can use together from the
        workspace credit pool per billing cycle. A member draws from one limit
        group at most, which also sets their limit per member.
      </span>
      <DataTable data={rows} columns={columns} getRowId={(row) => row.id} />
    </div>
  );
}
