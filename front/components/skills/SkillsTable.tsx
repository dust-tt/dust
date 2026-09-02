import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import type { BatchAvailabilityAction } from "@app/components/skills/SkillsBatchEdit";
import { SkillsBatchEditBar } from "@app/components/skills/SkillsBatchEdit";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { usePaginationFromUrl } from "@app/hooks/usePaginationFromUrl";
import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
import { getSkillAvatarIcon, isDustProvidedSkill } from "@app/lib/skill";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import {
  getManageSkillsRoute,
  getSkillBuilderRoute,
} from "@app/lib/utils/router";
import type { GetSkillsWithRelationsResponseBody } from "@app/types/api/skills";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import type { AgentsAndSkillsUsageType } from "@app/types/data_source";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import {
  Checkbox,
  Chip,
  Clipboard,
  ClipboardCheck,
  DataTable,
  Edit04,
  Eye,
  Label,
  LoadingBlock,
  Tooltip,
  Trash01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import type {
  CellContext,
  ColumnDef,
  HeaderContext,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

const SKELETON_ROW_COUNT = 16;

// A Dust-provided skill can never be edited, and a "members and agents"
// skill can only be batch-edited by someone who can make skills auto-discoverable.
export function isSkillSelectable(
  skill: { editedBy: number | null; availability: SkillAvailability },
  canMakeSkillAutoDiscoverable: boolean
): boolean {
  return (
    !isDustProvidedSkill(skill) &&
    (canMakeSkillAutoDiscoverable || skill.availability !== "users_and_agents")
  );
}

type RowData = {
  sId: string;
  name: string;
  icon: string | null;
  editedBy: number | null;
  description: string;
  availability: SkillAvailability;
  editors: UserType[] | null;
  usage: AgentsAndSkillsUsageType;
  messageCount: number | null;
  updatedAt: number | null;
  createdAt: number | null;
  onClick: () => void;
  menuItems: MenuItem[];
};

const SKILLS_TABLE_SKELETON_ROWS: RowData[] = Array.from(
  { length: SKELETON_ROW_COUNT },
  (_, index) => ({
    sId: `skill-skeleton-${index}`,
    name: "",
    icon: null,
    editedBy: null,
    description: "",
    availability: "editors",
    editors: [],
    usage: { count: 0, agents: [], skills: [] },
    messageCount: null,
    updatedAt: null,
    createdAt: null,
    onClick: () => undefined,
    menuItems: [],
  })
);

function renderSkillsTableSkeletonCell(columnId: string, rowIndex: number) {
  const rowVariant = rowIndex % 5;

  switch (columnId) {
    case "select":
      return (
        <DataTable.CellContent className="size-full items-center justify-center">
          <LoadingBlock className="h-4 w-4 rounded-sm" />
        </DataTable.CellContent>
      );
    case "name":
      return (
        <DataTable.CellContent>
          <div className="flex flex-row items-center gap-2 py-3">
            <LoadingBlock className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex min-w-0 grow flex-col">
              <div className="flex h-5 items-center">
                <LoadingBlock
                  className={classNames(
                    "h-3 max-w-full",
                    ["w-32", "w-40", "w-28", "w-36", "w-44"][rowVariant]
                  )}
                />
              </div>
              <div className="flex h-5 items-center">
                <LoadingBlock
                  className={classNames(
                    "h-3 max-w-full",
                    ["w-56", "w-64", "w-48", "w-60", "w-52"][rowVariant]
                  )}
                />
              </div>
            </div>
          </div>
        </DataTable.CellContent>
      );
    case "availability":
      return (
        <DataTable.CellContent>
          <LoadingBlock
            className={classNames(
              "h-6 rounded-[9px]",
              ["w-20", "w-28", "w-24", "w-28", "w-20"][rowVariant]
            )}
          />
        </DataTable.CellContent>
      );
    case "usedBy":
      return (
        <div className="flex h-12 w-full items-center justify-center">
          <LoadingBlock
            className={classNames(
              "h-5 rounded-md",
              ["w-14", "w-16", "w-12", "w-20", "w-14"][rowVariant]
            )}
          />
        </div>
      );
    case "messageCount":
      return (
        <DataTable.CellContent>
          <LoadingBlock
            className={classNames(
              "h-3",
              ["w-7", "w-9", "w-6", "w-8", "w-10"][rowVariant]
            )}
          />
        </DataTable.CellContent>
      );
    case "editors":
      return (
        <DataTable.CellContent>
          <div className="flex -space-x-2">
            {Array.from({ length: (rowIndex % 3) + 1 }, (_, index) => (
              <LoadingBlock
                key={index}
                className="h-7 w-7 rounded-full ring-2 ring-background"
              />
            ))}
          </div>
        </DataTable.CellContent>
      );
    case "updatedAt":
      return (
        <DataTable.CellContent>
          <LoadingBlock
            className={classNames(
              "h-3",
              ["w-14", "w-16", "w-20", "w-16", "w-14"][rowVariant]
            )}
          />
        </DataTable.CellContent>
      );
    case "menuItems":
      return (
        <DataTable.CellContent>
          <LoadingBlock className="h-8 w-8 rounded-xl" />
        </DataTable.CellContent>
      );
    default:
      return null;
  }
}

const nameColumn = {
  header: "Name",
  accessorKey: "name",
  cell: (info: CellContext<RowData, string>) => {
    const SkillAvatar = getSkillAvatarIcon(info.row.original);

    return (
      <DataTable.CellContent>
        <div className="flex flex-row items-center gap-2 py-3">
          <div>
            <SkillAvatar />
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
    );
  },
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
  cell: (info: CellContext<RowData, UserType[]>) => {
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
            visual: DUST_AVATAR_URL,
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
        onItemClick={onAgentClick}
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

// Control the menu locally so clicking "Copy link" does not close it.
function SkillActionsMenuButton({ menuItems }: { menuItems: MenuItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DataTable.MoreButton
      menuItems={menuItems}
      dropdownMenuProps={{ open: isOpen, onOpenChange: setIsOpen }}
    />
  );
}

const menuColumn = {
  header: "",
  accessorKey: "menuItems",
  cell: (info: CellContext<RowData, MenuItem[]>) => {
    return <SkillActionsMenuButton menuItems={info.getValue()} />;
  },
  meta: {
    className: "w-14",
  },
};

const selectionColumn = {
  header: (info: HeaderContext<RowData, boolean>) => {
    const areAllPageRowsSelected = info.table.getIsAllPageRowsSelected();
    const hasSelection = Object.values(info.table.getState().rowSelection).some(
      (isSelected) => isSelected
    );

    return (
      <DataTable.CellContent className="size-full items-center justify-center">
        <Checkbox
          checked={
            areAllPageRowsSelected ? true : hasSelection ? "partial" : false
          }
          disabled={
            !info.table.getRowModel().rows.some((row) => row.getCanSelect())
          }
          tooltip={
            areAllPageRowsSelected ? "Clear selection" : "Select all on page"
          }
          onClick={(e) => {
            e.stopPropagation();
          }}
          onCheckedChange={(checked) => {
            if (checked) {
              info.table.toggleAllPageRowsSelected(true);
            } else {
              // Unticking clears the whole selection across pages.
              info.table.resetRowSelection();
            }
          }}
        />
      </DataTable.CellContent>
    );
  },
  accessorKey: "select",
  cell: (info: CellContext<RowData, boolean>) => {
    const checkboxId = `select-skill-${info.row.id}`;
    const skillName = info.row.original.name;

    return (
      // `stopPropagation` only keeps the click from also reaching the row's `onClick`
      <Label
        htmlFor={checkboxId}
        className="flex size-full cursor-pointer items-center justify-center hover:bg-muted-background"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          id={checkboxId}
          aria-label={
            info.row.getIsSelected()
              ? `Deselect ${skillName}`
              : `Select ${skillName}`
          }
          checked={info.row.getIsSelected()}
          disabled={!info.row.getCanSelect()}
          onCheckedChange={(checked) => info.row.toggleSelected(!!checked)}
        />
      </Label>
    );
  },
  meta: {
    className: "w-10 p-0",
  },
  enableSorting: false,
};

const getTableColumns = ({
  onAgentClick,
  onUsedBySkillClick,
  enableSelection,
}: {
  onAgentClick: (agentId: string) => void;
  onUsedBySkillClick: (skillId: string) => void;
  enableSelection: boolean;
}) => {
  /**
   * Columns order:
   * - Selection (when batch edition is available)
   * - Name (always)
   * - Access (hidden on mobile)
   * - Used by (hidden on mobile)
   * - Usage (hidden on mobile)
   * - Editors (hidden on mobile)
   * - Last Edited (hidden on mobile)
   * - Actions (always)
   */

  return [
    ...(enableSelection ? [selectionColumn] : []),
    nameColumn,
    availabilityColumn,
    usedByColumn(onAgentClick, onUsedBySkillClick),
    usageColumn,
    editorsColumn,
    lastEditedColumn,
    menuColumn,
  ];
};

type SkillsTableProps = {
  skills: GetSkillsWithRelationsResponseBody["skills"];
  owner: LightWorkspaceType;
  onSkillClick: (
    skill: GetSkillsWithRelationsResponseBody["skills"][number]
  ) => void;
  onAgentClick: (agentId: string) => void;
  onUsedBySkillClick: (skillId: string) => void;
  canMakeSkillAutoDiscoverable?: boolean;
  enableSelection: boolean;
  rowSelection: RowSelectionState;
  setRowSelection: (selection: RowSelectionState) => void;
  isBatchUpdating: boolean;
  onSelectAvailabilityAction: (action: BatchAvailabilityAction) => void;
  isLoading?: boolean;
};

export function SkillsTable({
  skills,
  owner,
  onSkillClick,
  onAgentClick,
  onUsedBySkillClick,
  canMakeSkillAutoDiscoverable = false,
  enableSelection,
  rowSelection,
  setRowSelection,
  isBatchUpdating,
  onSelectAvailabilityAction,
  isLoading = false,
}: SkillsTableProps) {
  const router = useAppRouter();
  const { pagination, setPagination } = usePaginationFromUrl({});
  const [skillToArchive, setSkillToArchive] = useState<
    GetSkillsWithRelationsResponseBody["skills"][number] | null
  >(null);
  const [copiedSkillId, setCopiedSkillId] = useState<string | null>(null);
  const [isSkillLinkCopied, copySkillLink] = useCopyToClipboard();

  // Stable columns identity: rebuilding them on every selection change makes the
  // table re-render all rows.
  const columns = useMemo(
    () =>
      getTableColumns({
        onAgentClick,
        onUsedBySkillClick,
        enableSelection,
      }),
    [onAgentClick, onUsedBySkillClick, enableSelection]
  );
  const skeletonColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        cell: (info: CellContext<RowData, unknown>) =>
          renderSkillsTableSkeletonCell(info.column.id, info.row.index),
      })),
    [columns]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
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
        messageCount: skill.messageCount === undefined ? 0 : skill.messageCount,
        updatedAt: skill.updatedAt,
        createdAt: skill.createdAt,
        onClick: () => {
          onSkillClick(skill);
        },
        menuItems:
          skill.status !== "archived"
            ? [
                {
                  label: "Edit",
                  icon: Edit04,
                  disabled: !skill.canAdministrate,
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void router.push(
                      getSkillBuilderRoute(owner.sId, skill.sId)
                    );
                  },
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
                  label:
                    isSkillLinkCopied && copiedSkillId === skill.sId
                      ? "Copied!"
                      : "Copy link",
                  icon:
                    isSkillLinkCopied && copiedSkillId === skill.sId
                      ? ClipboardCheck
                      : Clipboard,
                  onClick: async (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCopiedSkillId(skill.sId);
                    await copySkillLink(
                      `${config.getAppUrl()}${getManageSkillsRoute(owner.sId, skill.sId)}`
                    );
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
                    setSkillToArchive(skill);
                  },
                  kind: "item" as const,
                },
              ].filter((item) => !item.disabled)
            : [],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is not stable, mutating the skills list which prevent pagination to work
    [
      skills,
      onSkillClick,
      owner.sId,
      isSkillLinkCopied,
      copiedSkillId,
      copySkillLink,
    ]
  );

  const selectionSet = useMemo(
    () => new Set(Object.keys(rowSelection)),
    [rowSelection]
  );

  const selectableRowIds = useMemo(
    () =>
      rows
        .filter((row) => isSkillSelectable(row, canMakeSkillAutoDiscoverable))
        .map((row) => row.sId),
    [rows, canMakeSkillAutoDiscoverable]
  );
  const totalSelectableCount = selectableRowIds.length;

  const skillsBySId = useMemo(
    () => new Map(skills.map((skill) => [skill.sId, skill])),
    [skills]
  );

  const selectedSkills = useMemo(
    () =>
      selectableRowIds
        .filter((sId) => selectionSet.has(sId))
        .map((sId) => skillsBySId.get(sId))
        .filter(
          (s): s is GetSkillsWithRelationsResponseBody["skills"][number] => !!s
        ),
    [selectableRowIds, selectionSet, skillsBySId]
  );

  if (!isLoading && rows.length === 0) {
    return null;
  }

  return (
    <>
      {skillToArchive && (
        <ArchiveSkillDialog
          owner={owner}
          isOpen={true}
          skill={skillToArchive}
          onClose={() => {
            setSkillToArchive(null);
          }}
        />
      )}
      <div
        role={isLoading ? "status" : undefined}
        aria-label={isLoading ? "Loading skills" : undefined}
        aria-busy={isLoading || undefined}
      >
        {isLoading ? (
          <div aria-hidden="true" className="flex flex-col gap-2">
            <DataTable
              className="relative"
              data={SKILLS_TABLE_SKELETON_ROWS}
              columns={skeletonColumns}
              enableRowSelection={() => false}
              disableRowClickSelection
              rowSelection={{}}
              setRowSelection={() => undefined}
            />
            <div className="p-1">
              <div className="flex h-8 items-center justify-end">
                <LoadingBlock className="h-3 w-14" />
              </div>
            </div>
          </div>
        ) : (
          <DataTable
            className="relative"
            data={rows}
            columns={columns}
            pagination={pagination}
            setPagination={setPagination}
            disableRowClickSelection
            {...(enableSelection
              ? {
                  rowSelection,
                  setRowSelection,
                  enableRowSelection: (row: Row<RowData>) =>
                    isSkillSelectable(
                      row.original,
                      canMakeSkillAutoDiscoverable
                    ),
                  getRowId: (row: RowData) => row.sId,
                }
              : {})}
          />
        )}
      </div>
      {enableSelection && (
        <SkillsBatchEditBar
          owner={owner}
          selectedSkills={selectedSkills}
          totalCount={totalSelectableCount}
          isUpdating={isBatchUpdating}
          canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
          onClear={() => setRowSelection({})}
          onSelectAll={() =>
            setRowSelection(
              Object.fromEntries(selectableRowIds.map((sId) => [sId, true]))
            )
          }
          onSelectAction={onSelectAvailabilityAction}
        />
      )}
    </>
  );
}
