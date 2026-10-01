import { SkillSearchActionsMenu } from "@app/components/skills/SkillSearchActionsMenu";
import {
  SkillAvailabilityCell,
  SkillEditorsCell,
  SkillLastEditedCell,
} from "@app/components/skills/SkillTableCells";
import { EntityTooltipCard } from "@app/components/workspace/analytics/creditsTableCells";
import { formatNumber } from "@app/lib/i18n/format";
import { getSkillAvatarIcon, isDustProvidedSkill } from "@app/lib/skill";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AvatarCellSkeleton,
  Checkbox,
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  Label,
  LoadingBlock,
  TextCellSkeleton,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

// Leave room for Select, Usage and Actions, then Editors/Last edited at @sm and Availability at @md.
/**
 * @cc [owner:aubin-tchoi,label:product] skill-name-column-visibility
 * Secondary columns MUST hide based on available container width to keep skill names
 * visible.
 */
const SKILL_SEARCH_NAME_COLUMN_WIDTH =
  "w-[calc(100%-12rem)] @sm:w-[calc(100%-28rem)] @md:w-[calc(100%-38rem)]";

interface SkillSearchTableProps {
  owner: LightWorkspaceType;
  skills: SkillListItemType[];
  onSelect: (skillId: string) => void;
  onRefresh: () => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  total: number;
  sorting: SortingState;
  setSorting: (sorting: SortingState) => void;
  isLoading: boolean;
  selectedSkillIds: string[];
  setSelectedSkillIds: (skillIds: string[]) => void;
  canSelect: (skill: SkillListItemType) => boolean;
}

type SkillSearchRow = SkillListItemType & { onClick: () => void };

// Cells render as components, so a new `columns` identity remounts every cell: an open menu
// closes and an in-flight checkbox click is lost.
/**
 * @cc [owner:tdraier,label:react;performance] stable-columns
 * `columns` MUST only be rebuilt when `onSelect`, `onRefresh` or `owner` change, never on data the
 * table loads itself. Callers MUST keep `onSelect` and `onRefresh` referentially stable while the
 * search inputs are unchanged.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] skill-name-tooltip
 * Hovering or focusing a skill name must show its name and user-facing description.
 */
/**
 * @cc [owner:aubin-tchoi,label:react] matching-table-density
 * The loaded table and its loading skeleton MUST use the same density.
 * Skeleton cells MUST match the loaded cells' alignment, visual sizes and spacing.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] batch-selection-availability
 * The selection column MUST be hidden when none of the displayed skills satisfy `canSelect`.
 */
export function SkillSearchTable({
  owner,
  skills,
  onSelect,
  onRefresh,
  pagination,
  setPagination,
  total,
  sorting,
  setSorting,
  isLoading,
  selectedSkillIds,
  setSelectedSkillIds,
  canSelect,
}: SkillSearchTableProps) {
  const columns = useMemo(
    () =>
      [
        {
          id: "select" as const,
          header: ({ table }) => {
            const areAllPageRowsSelected = table.getIsAllPageRowsSelected();
            const hasSelection = Object.values(
              table.getState().rowSelection
            ).some((isSelected) => isSelected);

            return (
              <DataTable.CellContent className="size-full items-center justify-center">
                <Checkbox
                  checked={
                    areAllPageRowsSelected
                      ? true
                      : hasSelection
                        ? "partial"
                        : false
                  }
                  disabled={
                    !table.getRowModel().rows.some((row) => row.getCanSelect())
                  }
                  tooltip={
                    areAllPageRowsSelected
                      ? "Clear selection"
                      : "Select all on page"
                  }
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      table.toggleAllPageRowsSelected(true);
                    } else {
                      // Unticking clears the whole selection across pages.
                      table.resetRowSelection();
                    }
                  }}
                />
              </DataTable.CellContent>
            );
          },
          cell: ({ row }) => {
            if (!row.getCanSelect()) {
              return null;
            }
            const checkboxId = `select-skill-${row.id}`;
            return (
              // Keep the click from reaching the row, which opens the skill details.
              <Label
                htmlFor={checkboxId}
                className="flex size-full cursor-pointer items-center justify-center hover:bg-muted-background"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  id={checkboxId}
                  aria-label={
                    row.getIsSelected()
                      ? `Deselect ${row.original.name}`
                      : `Select ${row.original.name}`
                  }
                  checked={row.getIsSelected()}
                  onCheckedChange={(checked) => row.toggleSelected(!!checked)}
                />
              </Label>
            );
          },
          meta: { className: "w-10 p-0" },
        },
        {
          id: "name" as const,
          accessorKey: "name",
          header: "Name",
          sortDescFirst: false,
          enableMultiSort: false,
          cell: ({ row: { original: skill } }) => {
            const SkillAvatar = getSkillAvatarIcon(skill);

            return (
              <DataTable.CellContent>
                <Tooltip
                  label={
                    <div className="py-1.5">
                      <EntityTooltipCard
                        avatar={<SkillAvatar name={skill.name} size="xs" />}
                        name={skill.name}
                        description={skill.userFacingDescription}
                      />
                    </div>
                  }
                  tooltipTriggerAsChild
                  trigger={
                    <button type="button" className="w-full min-w-0 text-left">
                      <div className="flex items-center gap-2 py-1">
                        <SkillAvatar size="xs" />
                        <span className="heading-sm min-w-0 grow overflow-hidden truncate text-foreground">
                          {skill.name}
                        </span>
                      </div>
                    </button>
                  }
                />
              </DataTable.CellContent>
            );
          },
          meta: {
            className: SKILL_SEARCH_NAME_COLUMN_WIDTH,
            rowHeader: true,
          },
        },
        {
          id: "availability" as const,
          header: "Availability",
          cell: ({ row: { original: skill } }) => (
            <SkillAvailabilityCell availability={skill.availability} />
          ),
          meta: {
            type: "status",
            className: "hidden w-40 @md:table-cell",
          },
        },
        {
          id: "usage" as const,
          accessorKey: "activeUsersCount",
          header: "Usage",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: skill } }) => (
            <DataTable.BasicCellContent
              label={
                skill.activeUsersCount === null
                  ? "-"
                  : formatNumber(skill.activeUsersCount)
              }
              tooltip={
                skill.activeUsersCount === null
                  ? "Usage is not available for this skill."
                  : "Number of active users in the last 30 days."
              }
            />
          ),
          meta: { type: "numeric", className: "w-24 font-mono" },
        },
        {
          id: "editors" as const,
          header: "Editors",
          cell: ({ row: { original: skill } }) => (
            <SkillEditorsCell
              editors={isDustProvidedSkill(skill) ? null : skill.editors}
            />
          ),
          meta: { className: "hidden w-32 pl-6 @sm:table-cell" },
        },
        {
          id: "updatedAt" as const,
          accessorKey: "updatedAt",
          header: "Last edited",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: skill } }) => (
            <SkillLastEditedCell updatedAt={skill.updatedAt} emptyLabel="-" />
          ),
          meta: { className: "hidden w-32 @sm:table-cell" },
        },
        {
          id: "actions" as const,
          header: "",
          cell: ({ row: { original: skill } }) =>
            skill.status === "archived" ? null : (
              <SkillSearchActionsMenu
                owner={owner}
                skillId={skill.sId}
                onSelect={onSelect}
                onRefresh={onRefresh}
              />
            ),
          meta: { className: "w-14" },
        },
      ] satisfies ColumnDef<SkillSearchRow>[],
    [onRefresh, onSelect, owner]
  );
  const hasSelectableRows = skills.some(canSelect);
  const visibleColumns = useMemo(
    () =>
      hasSelectableRows
        ? columns
        : columns.filter((column) => column.id !== "select"),
    [columns, hasSelectableRows]
  );

  // Show skeletons only when no rows are available; keep previous results during refreshes.
  // Mirror BasicCellContent's inner h-12 so the divider contributes equally to row height.
  if (isLoading && skills.length === 0) {
    return (
      <div role="status" aria-label="Loading skills">
        <DataTableSkeleton
          columns={visibleColumns}
          rowCount={12}
          density="default"
          SkeletonCell={({ columnId, rowIndex }) => {
            switch (columnId) {
              case "select":
                return (
                  <div className="flex size-full items-center justify-center">
                    <LoadingBlock className="h-4 w-4 rounded-sm" />
                  </div>
                );
              case "name":
                return (
                  <AvatarCellSkeleton>
                    <TextCellSkeleton
                      className={rowIndex % 2 === 0 ? "h-4 w-32" : "h-4 w-40"}
                    />
                  </AvatarCellSkeleton>
                );
              case "availability":
                return <ChipCellSkeleton />;
              case "usage":
                return (
                  <div className="flex h-12 items-center justify-end">
                    <TextCellSkeleton className="w-8" />
                  </div>
                );
              case "editors":
                return <LoadingBlock className="h-6 w-6 rounded-full" />;
              case "updatedAt":
                return (
                  <div className="flex h-12 items-center">
                    <TextCellSkeleton className="w-20" />
                  </div>
                );
              case "actions":
                return <LoadingBlock className="h-8 w-8 rounded-xl" />;
              default:
                assertNeverAndIgnore(columnId);
                return null;
            }
          }}
        />
      </div>
    );
  }

  return (
    <DataTable
      data={skills.map((skill) => ({
        ...skill,
        onClick: () => onSelect(skill.sId),
      }))}
      columns={visibleColumns}
      density="default"
      getRowId={(skill) => skill.sId}
      enableRowSelection={(row) => canSelect(row.original)}
      disableRowClickSelection
      rowSelection={Object.fromEntries(
        selectedSkillIds.map((skillId) => [skillId, true])
      )}
      setRowSelection={(rowSelection) =>
        setSelectedSkillIds(
          Object.keys(rowSelection).filter((skillId) => rowSelection[skillId])
        )
      }
      isLoading={isLoading}
      pagination={pagination}
      setPagination={setPagination}
      sorting={sorting}
      setSorting={setSorting}
      isServerSideSorting
      totalRowCount={total}
    />
  );
}
