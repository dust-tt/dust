import type { MenuItem } from "@dust-tt/sparkle";
import {
  Checkbox,
  Chip,
  DataTable,
  DustLogoSquare,
  Edit04,
  Eye,
  Tooltip,
  Trash01,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  PaginationState,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import type { FleetUsage } from "../../data/fleetUsage";
import type {
  ManagedSkill,
  SkillAvailability,
  SkillEditor,
  SkillUsage,
} from "../../data/manageSkills";
import { SkillAvatar } from "./skillIcons";
import { UsageCell } from "./UsageCell";
import { UsedByButton } from "./UsedByButton";
import { formatTimestampToFriendlyDate } from "./utils";

type RowData = {
  sId: string;
  name: string;
  icon: string | null;
  editedBy: number | null;
  description: string;
  availability: SkillAvailability;
  editors: SkillEditor[] | null;
  usage: SkillUsage;
  messageUsage: FleetUsage | null;
  updatedAt: number | null;
  createdAt: number | null;
  onClick: () => void;
  menuItems: MenuItem[];
};

export const SKILL_AVAILABILITY_DISPLAY: Record<
  SkillAvailability,
  { label: string; color: "primary" | "success" | "highlight"; tooltip: string }
> = {
  editors: {
    label: "Editors only",
    color: "primary",
    tooltip: "Only editors can find it via the input bar and agent builder",
  },
  workspace_users: {
    label: "Members",
    color: "success",
    tooltip: "All members can find it via the input bar and agent builder",
  },
  users_and_agents: {
    label: "Members and agents",
    color: "highlight",
    tooltip: "Available to all members and agents with Discover Skills",
  },
};

/**
 * Local replacement for sparkle's `createSelectionColumn`: identical, but the
 * checkbox stops the click from bubbling to the row. Sparkle's version lets it
 * through, which used to be harmless (checkboxes only existed in batch mode,
 * where the row click was a no-op) but now opens the details sheet on every
 * tick. Worth pushing upstream if this graduates out of the playground.
 */
function createFleetSelectionColumn(): ColumnDef<RowData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomeRowsSelected()
              ? "partial"
              : false
        }
        tooltip={
          table.getIsAllPageRowsSelected()
            ? "Clear selection"
            : "Select all on page"
        }
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={(state) => {
          if (state === "indeterminate") {
            return;
          }
          if (state) {
            table.toggleAllPageRowsSelected(true);
          } else {
            table.resetRowSelection();
          }
        }}
      />
    ),
    cell: ({ row }) => (
      <div className="flex h-full w-full items-center">
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(state) => {
            if (state !== "indeterminate") {
              row.toggleSelected(state);
            }
          }}
        />
      </div>
    ),
    meta: {
      className: "w-10",
    },
  };
}

const nameColumn = {
  header: "Name",
  accessorKey: "name",
  cell: (info: CellContext<RowData, string>) => (
    <DataTable.CellContent>
      <div className="flex flex-row items-center gap-2 py-3">
        <div>
          <SkillAvatar
            icon={info.row.original.icon}
            isDustProvided={info.row.original.editedBy === null}
          />
        </div>
        <div className="flex min-w-0 grow flex-col">
          <div className="heading-sm overflow-hidden truncate text-foreground">
            {info.getValue()}
          </div>
          <div className="overflow-hidden truncate text-sm text-muted-foreground">
            {info.row.original.description}
          </div>
        </div>
      </div>
    </DataTable.CellContent>
  ),
  meta: {
    className: "w-40 @lg:w-full",
  },
};

const availabilityColumn = {
  header: "Availability",
  accessorKey: "availability",
  cell: (info: CellContext<RowData, SkillAvailability>) => {
    const display = SKILL_AVAILABILITY_DISPLAY[info.getValue()];
    return (
      <DataTable.CellContent>
        <Tooltip
          label={display.tooltip}
          trigger={
            <Chip size="xs" color={display.color} label={display.label} />
          }
        />
      </DataTable.CellContent>
    );
  },
  meta: {
    className: "hidden @sm:w-40 @sm:table-cell",
  },
};

const editorsColumn = {
  header: "Editors",
  accessorKey: "editors",
  cell: (info: CellContext<RowData, SkillEditor[] | null>) => {
    const editors = info.getValue();
    const items = editors
      ? editors.map((editor) => ({
          name: editor.fullName,
          visual: editor.image,
          isRounded: true,
        }))
      : // Only Dust-managed skills should have no editors
        [
          {
            name: "Dust",
            visual: <DustLogoSquare className="h-full w-full" />,
            isRounded: false,
          },
        ];
    return <DataTable.CellContent avatarStack={{ items, nbVisibleItems: 4 }} />;
  },
  meta: {
    className: "hidden @sm:w-32 @sm:table-cell",
  },
};

const usedByColumn = (
  onAgentClick: (agentId: string) => void,
  onUsedBySkillClick: (skillId: string) => void
): ColumnDef<RowData, number> => ({
  id: "usedBy",
  header: () => <div className="flex w-full justify-center">Used by</div>,
  accessorFn: (row: RowData) => row.usage?.count ?? 0,
  cell: (info: CellContext<RowData, number>) => (
    <div className="flex h-12 w-full items-center justify-center">
      <UsedByButton
        usage={info.row.original.usage}
        onAgentClick={onAgentClick}
        onSkillClick={onUsedBySkillClick}
      />
    </div>
  ),
  meta: {
    className: "hidden px-0 @sm:w-32 @sm:table-cell",
  },
});

const usageColumn = (nowMs: number): ColumnDef<RowData, number> => ({
  id: "usage",
  header: "Usage",
  // Sorting on the human count: programmatic traffic must not be able to float
  // a skill nobody actually reaches for.
  accessorFn: (row: RowData) => row.messageUsage?.human ?? -1,
  cell: (info: CellContext<RowData, number>) => (
    <DataTable.CellContent>
      <UsageCell
        usage={info.row.original.messageUsage}
        emptyTooltip="System skills are always active, so message usage does not apply."
        nowMs={nowMs}
      />
    </DataTable.CellContent>
  ),
  meta: {
    className: "hidden @sm:w-24 @sm:table-cell",
    tooltip: "Human messages in the last 30 days",
  },
});

const lastEditedColumn = {
  header: "Last Edited",
  accessorKey: "updatedAt",
  cell: (info: CellContext<RowData, number | null>) => {
    const value = info.getValue();
    return (
      <DataTable.BasicCellContent
        tooltip={value ? formatTimestampToFriendlyDate(value, "long") : ""}
        label={value ? formatTimestampToFriendlyDate(value, "compact") : ""}
      />
    );
  },
  meta: { className: "hidden @sm:w-32 @sm:table-cell" },
};

const menuColumn = {
  header: "",
  accessorKey: "menuItems",
  cell: (info: CellContext<RowData, MenuItem[]>) => (
    <DataTable.MoreButton menuItems={info.getValue()} />
  ),
  meta: {
    className: "w-14",
  },
};

const getTableColumns = ({
  onAgentClick,
  onUsedBySkillClick,
  enableRowSelection,
  nowMs,
}: {
  onAgentClick: (agentId: string) => void;
  onUsedBySkillClick: (skillId: string) => void;
  enableRowSelection: boolean;
  nowMs: number;
}) => {
  /**
   * Columns order:
   * - Selection (batch edition only)
   * - Name (always)
   * - Access (hidden on mobile)
   * - Used by (hidden on mobile)
   * - Usage (hidden on mobile)
   * - Editors (hidden on mobile)
   * - Last Edited (hidden on mobile)
   * - Actions (always)
   */

  return [
    ...(enableRowSelection ? [createFleetSelectionColumn()] : []),
    nameColumn,
    availabilityColumn,
    usedByColumn(onAgentClick, onUsedBySkillClick),
    usageColumn(nowMs),
    editorsColumn,
    lastEditedColumn,
    menuColumn,
  ];
};

interface ManageSkillsTableProps {
  skills: ManagedSkill[];
  nowMs: number;
  onSkillClick: (skill: ManagedSkill) => void;
  onAgentClick: (agentId: string) => void;
  onUsedBySkillClick: (skillId: string) => void;
  onArchiveSkill: (skill: ManagedSkill) => void;
  canMakeSkillAutoDiscoverable?: boolean;
  rowSelection?: RowSelectionState;
  setRowSelection?: (selection: RowSelectionState) => void;
}

export function ManageSkillsTable({
  skills,
  nowMs,
  onSkillClick,
  onAgentClick,
  onUsedBySkillClick,
  onArchiveSkill,
  canMakeSkillAutoDiscoverable = false,
  rowSelection,
  setRowSelection,
}: ManageSkillsTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const isSelectionEnabled = rowSelection !== undefined;
  // Batch mode is entered by ticking a row, not by a button.
  const isBatchMode =
    rowSelection !== undefined &&
    Object.values(rowSelection).some((selected) => selected);

  // Stable columns identity: rebuilding them on every selection change makes the
  // table re-render all rows.
  const columns = useMemo(
    () =>
      getTableColumns({
        onAgentClick,
        onUsedBySkillClick,
        enableRowSelection: isSelectionEnabled,
        nowMs,
      }),
    [onAgentClick, onUsedBySkillClick, isSelectionEnabled, nowMs]
  );

  const rows: RowData[] = useMemo(
    () =>
      skills.map((skill) => ({
        sId: skill.sId,
        name: skill.name,
        icon: skill.icon,
        editedBy: skill.editedBy,
        description: skill.userFacingDescription,
        availability: skill.availability,
        editors: skill.relations.editors,
        usage: skill.relations.usage,
        messageUsage: skill.messageUsage,
        updatedAt: skill.updatedAt,
        createdAt: skill.createdAt,
        onClick: () => {
          // Once a row is ticked the DataTable toggles selection on row click;
          // don't open the details panel on top of it.
          if (isBatchMode) {
            return;
          }
          onSkillClick(skill);
        },
        menuItems:
          skill.status !== "archived"
            ? [
                {
                  label: "Edit",
                  icon: Edit04,
                  disabled: !skill.canAdministrate,
                  onClick: (e: React.MouseEvent) => e.stopPropagation(),
                  kind: "item" as const,
                },
                {
                  label: "More info",
                  icon: Eye,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onSkillClick(skill);
                  },
                  kind: "item" as const,
                },
                {
                  label: "Archive",
                  icon: Trash01,
                  disabled: !skill.canAdministrate,
                  variant: "warning" as const,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onArchiveSkill(skill);
                  },
                  kind: "item" as const,
                },
              ].filter((item) => !item.disabled)
            : [],
      })),
    [skills, onSkillClick, onArchiveSkill, isBatchMode]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <DataTable
      className="relative"
      data={rows}
      columns={columns}
      pagination={pagination}
      setPagination={setPagination}
      {...(rowSelection !== undefined && setRowSelection
        ? {
            rowSelection,
            setRowSelection,
            enableRowSelection: (row: Row<RowData>) =>
              row.original.editedBy !== null &&
              (canMakeSkillAutoDiscoverable ||
                row.original.availability !== "users_and_agents"),
            disableRowClickSelection: !isBatchMode,
            getRowId: (row: RowData) => row.sId,
          }
        : {})}
    />
  );
}
