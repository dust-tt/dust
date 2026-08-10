import type { MenuItem } from "@dust-tt/sparkle";
import {
  Chip,
  createSelectionColumn,
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

import type {
  ManagedSkill,
  SkillAvailability,
  SkillEditor,
  SkillUsage,
} from "../../data/manageSkills";
import { SkillAvatar } from "./skillIcons";
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
  messageCount: number | null;
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

const usageColumn: ColumnDef<RowData, number | null> = {
  header: "Usage",
  accessorKey: "messageCount",
  cell: (info: CellContext<RowData, number | null>) => {
    const messageCount = info.getValue();

    return (
      <DataTable.BasicCellContent
        className="font-mono"
        label={messageCount === null ? "-" : messageCount.toLocaleString()}
        tooltip={
          messageCount === null
            ? "System skills are always active, so message usage does not apply."
            : undefined
        }
      />
    );
  },
  meta: {
    className: "hidden @sm:w-20 @sm:table-cell",
    tooltip: "All-time messages",
  },
};

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
}: {
  onAgentClick: (agentId: string) => void;
  onUsedBySkillClick: (skillId: string) => void;
  enableRowSelection: boolean;
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
    ...(enableRowSelection ? [createSelectionColumn<RowData>()] : []),
    nameColumn,
    availabilityColumn,
    usedByColumn(onAgentClick, onUsedBySkillClick),
    usageColumn,
    editorsColumn,
    lastEditedColumn,
    menuColumn,
  ];
};

interface ManageSkillsTableProps {
  skills: ManagedSkill[];
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

  // Stable columns identity: rebuilding them on every selection change makes the
  // table re-render all rows.
  const columns = useMemo(
    () =>
      getTableColumns({
        onAgentClick,
        onUsedBySkillClick,
        enableRowSelection: isSelectionEnabled,
      }),
    [onAgentClick, onUsedBySkillClick, isSelectionEnabled]
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
        messageCount: skill.messageCount,
        updatedAt: skill.updatedAt,
        createdAt: skill.createdAt,
        onClick: () => {
          // During batch edition the DataTable itself toggles the row selection
          // on click; don't open the details panel on top of it.
          if (isSelectionEnabled) {
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
    [skills, onSkillClick, onArchiveSkill, isSelectionEnabled]
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
            getRowId: (row: RowData) => row.sId,
          }
        : {})}
    />
  );
}
