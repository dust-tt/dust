import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import { useGroups, useUpdateGroupSpendLimit } from "@app/lib/swr/groups";
import type { GroupSpendLimit } from "@app/types/api/groups/spend_limit";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { DataTable, InputWithSave, Spinner, Users01 } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

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

interface GroupCapCellProps {
  group: GroupRowData;
  onSave: (group: GroupRowData, limit: GroupSpendLimit) => Promise<void>;
}

// Per-row editable cap cell. Empty input clears the cap (unlimited); 0 blocks
// the group's pool access; a positive integer sets a custom limit. Reverts to
// the current value when nothing is persisted.
function GroupCapCell({ group, onSave }: GroupCapCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const current = group.poolCapAwuCredits;

  const handleSave = async (newValue: string) => {
    const trimmed = newValue.trim();
    if (trimmed === "") {
      if (current === null) {
        return;
      }
      await onSave(group, { kind: "unlimited" });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === current) {
      return;
    }
    await onSave(group, { kind: "limited", awuCredits: parsed });
  };

  return (
    <div className="w-60">
      <InputWithSave
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="No limit"
        value={current === null ? "" : current.toLocaleString()}
        unit={current === null && !isEditing ? undefined : "credits/month"}
        normalizeValue={(value) => value.replace(/[^\d]/g, "")}
        formatValue={(value) =>
          value ? Number(value).toLocaleString() : value
        }
        onSave={handleSave}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
      />
    </div>
  );
}

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
                <GroupCapCell
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
