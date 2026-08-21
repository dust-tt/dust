import { GroupModelTierPickerDropdown } from "@app/components/workspace/GroupModelTierPickerDropdown";
import { ModelTiersInfoButton } from "@app/components/workspace/ModelTiersInfoModal";
import {
  useGroups,
  useUpdateGroupSpendLimit,
  useUpdateGroupWorkflowAlertThreshold,
} from "@app/lib/swr/groups";
import type { GroupSpendLimit } from "@app/types/api/groups/spend_limit";
import type { GroupWorkflowAlertThreshold } from "@app/types/api/groups/workflow_alert_threshold";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { DataTable, InputWithSave, Spinner, Users01 } from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

interface GroupsUsageTableProps {
  owner: LightWorkspaceType;
  readOnly: boolean;
  showModelTiersColumn?: boolean;
}

type GroupRowData = {
  groupId: string;
  name: string;
  memberCount: number;
  poolCapAwuCredits: number | null;
  workflowAlertThresholdAwuCredits: number | null;
  onClick?: () => void;
};

type GroupInfo = CellContext<GroupRowData, string>;

interface GroupCapCellProps {
  group: GroupRowData;
  readOnly: boolean;
  onSave: (group: GroupRowData, limit: GroupSpendLimit) => Promise<void>;
}

// Per-row editable cap cell. Empty input clears the cap (unlimited); 0 blocks
// the group's pool access; a positive integer sets a custom limit. Reverts to
// the current value when nothing is persisted.
function GroupCapCell({ group, readOnly, onSave }: GroupCapCellProps) {
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
        disabled={readOnly}
      />
    </div>
  );
}

interface WorkflowAlertThresholdCellProps {
  group: GroupRowData;
  readOnly: boolean;
  onSave: (
    group: GroupRowData,
    threshold: GroupWorkflowAlertThreshold
  ) => Promise<void>;
}

// Per-row editable smooth shutdown threshold cell. Empty input disables the
// smooth shutdown flow for the group; a non-negative integer enables it at
// that credit threshold. Reverts to the current value when nothing is
// persisted.
function WorkflowAlertThresholdCell({
  group,
  readOnly,
  onSave,
}: WorkflowAlertThresholdCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const current = group.workflowAlertThresholdAwuCredits;

  const handleSave = async (newValue: string) => {
    const trimmed = newValue.trim();
    if (trimmed === "") {
      if (current === null) {
        return;
      }
      await onSave(group, { kind: "disabled" });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === current) {
      return;
    }
    await onSave(group, { kind: "enabled", awuCredits: parsed });
  };

  return (
    <div className="w-60">
      <InputWithSave
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="Disabled"
        value={current === null ? "" : current.toLocaleString()}
        unit={current === null && !isEditing ? undefined : "credits"}
        normalizeValue={(value) => value.replace(/[^\d]/g, "")}
        formatValue={(value) =>
          value ? Number(value).toLocaleString() : value
        }
        onSave={handleSave}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        disabled={readOnly}
      />
    </div>
  );
}

export function GroupsUsageTable({
  owner,
  readOnly,
  showModelTiersColumn = false,
}: GroupsUsageTableProps) {
  const { groups, isGroupsLoading } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
  });
  const { doUpdateGroupSpendLimit } = useUpdateGroupSpendLimit({
    workspaceId: owner.sId,
  });
  const { doUpdateGroupWorkflowAlertThreshold } =
    useUpdateGroupWorkflowAlertThreshold({
      workspaceId: owner.sId,
    });

  const rows: GroupRowData[] = useMemo(
    () =>
      groups.map((group) => ({
        groupId: group.sId,
        name: group.name,
        memberCount: group.memberCount,
        poolCapAwuCredits: group.poolCapAwuCredits,
        workflowAlertThresholdAwuCredits:
          group.workflowAlertThresholdAwuCredits,
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
      {
        id: "cap",
        header: "Spend limit",
        meta: { className: "w-64" },
        cell: (info: GroupInfo) => (
          <GroupCapCell
            group={info.row.original}
            readOnly={readOnly}
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
      },
      {
        id: "workflowAlertThreshold",
        header: "Smooth shutdown threshold",
        meta: { className: "w-64" },
        cell: (info: GroupInfo) => (
          <WorkflowAlertThresholdCell
            group={info.row.original}
            readOnly={readOnly}
            onSave={async (group, threshold) => {
              await doUpdateGroupWorkflowAlertThreshold({
                groupId: group.groupId,
                groupName: group.name,
                threshold,
              });
            }}
          />
        ),
        enableSorting: false,
      },
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
                  readOnly={readOnly}
                />
              ),
              enableSorting: false,
            } satisfies ColumnDef<GroupRowData, string>,
          ]
        : []),
    ],
    [
      owner,
      readOnly,
      showModelTiersColumn,
      doUpdateGroupSpendLimit,
      doUpdateGroupWorkflowAlertThreshold,
    ]
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
      <span className="copy-sm text-muted-foreground">
        A group's monthly spend limit applies to each of its members. When a
        member belongs to several groups, the highest limit is used.
      </span>
      <DataTable
        filterColumn="name"
        data={rows}
        columns={columns}
        columnsBreakpoints={{ name: "md" }}
      />
    </div>
  );
}
