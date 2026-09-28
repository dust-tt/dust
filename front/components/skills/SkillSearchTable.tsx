import { SkillSearchActionsMenu } from "@app/components/skills/SkillSearchActionsMenu";
import {
  SkillAvailabilityCell,
  SkillEditorsCell,
  SkillLastEditedCell,
  SkillNameCell,
} from "@app/components/skills/SkillTableCells";
import { UsedByButton } from "@app/components/spaces/UsedByButton";
import { useSkillsUsedBy } from "@app/hooks/useSkillsUsedBy";
import { isDustProvidedSkill } from "@app/lib/skill";
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
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { createContext, useContext, useMemo } from "react";

// Leave room for Select, Usage and Actions, then Editors/Last edited at sm, Availability at md and
// Used by at lg.
const SKILL_SEARCH_NAME_COLUMN_WIDTH =
  "w-[calc(100%-12rem)] sm:w-[calc(100%-28rem)] md:w-[calc(100%-38rem)] lg:w-[calc(100%-46rem)]";

interface SkillSearchTableProps {
  owner: LightWorkspaceType;
  skills: SkillListItemType[];
  onSelect: (skillId: string) => void;
  onAgentClick: (agentId: string) => void;
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

// The ids of the displayed page, computed once per page rather than in every cell.
const PageSkillIdsContext = createContext<string[]>([]);

interface SkillSearchUsedByCellProps {
  owner: LightWorkspaceType;
  skillId: string;
  onAgentClick: (agentId: string) => void;
  onSkillClick: (skillId: string) => void;
}

// Every cell of the page requests the same key, which SWR deduplicates into one call.
function SkillSearchUsedByCell({
  owner,
  skillId,
  onAgentClick,
  onSkillClick,
}: SkillSearchUsedByCellProps) {
  const pageSkillIds = useContext(PageSkillIdsContext);
  const { usedBy, isUsedByLoading } = useSkillsUsedBy({
    owner,
    skillIds: pageSkillIds,
  });
  const usage = usedBy?.[skillId];

  return (
    <div className="flex h-12 w-full items-center justify-center">
      {isUsedByLoading ? (
        <LoadingBlock className="h-5 w-14 rounded-md" />
      ) : usage ? (
        <UsedByButton
          usage={usage}
          onItemClick={onAgentClick}
          onSkillClick={onSkillClick}
        />
      ) : (
        "-"
      )}
    </div>
  );
}

// Cells render as components, so a new `columns` identity remounts every cell: an open menu
// closes and an in-flight checkbox click is lost.
/**
 * @cc [owner:tdraier,label:react;performance] stable-columns
 * `columns` MUST only be rebuilt when `onSelect`, `onAgentClick`, `onRefresh` or `owner` change,
 * never on data the table loads itself. Callers MUST keep `onSelect`, `onAgentClick` and
 * `onRefresh` referentially stable while the search inputs are unchanged.
 */
export function SkillSearchTable({
  owner,
  skills,
  onSelect,
  onAgentClick,
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
  const pageSkillIds = useMemo(
    () => skills.map((skill) => skill.sId),
    [skills]
  );
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
          cell: ({ row: { original: skill } }) => (
            <DataTable.CellContent>
              <button type="button" className="w-full min-w-0 text-left">
                <SkillNameCell skill={skill} />
              </button>
            </DataTable.CellContent>
          ),
          meta: { className: SKILL_SEARCH_NAME_COLUMN_WIDTH },
        },
        {
          id: "availability" as const,
          header: "Availability",
          cell: ({ row: { original: skill } }) => (
            <SkillAvailabilityCell availability={skill.availability} />
          ),
          meta: { className: "hidden w-40 md:table-cell" },
        },
        {
          id: "usedBy" as const,
          header: () => (
            <div className="flex w-full justify-center">Used by</div>
          ),
          cell: ({ row: { original: skill } }) => (
            <SkillSearchUsedByCell
              owner={owner}
              skillId={skill.sId}
              onAgentClick={onAgentClick}
              onSkillClick={onSelect}
            />
          ),
          meta: { className: "hidden w-32 px-0 lg:table-cell" },
        },
        {
          id: "usage" as const,
          accessorKey: "activeUsersCount",
          header: "Usage",
          sortDescFirst: true,
          enableMultiSort: false,
          cell: ({ row: { original: skill } }) => (
            <DataTable.BasicCellContent
              label={skill.activeUsersCount?.toLocaleString() ?? "-"}
              tooltip={
                skill.activeUsersCount === null
                  ? "Usage is not available for this skill."
                  : "Number of active users in the last 30 days."
              }
            />
          ),
          meta: { className: "w-24 font-mono tabular-nums" },
        },
        {
          id: "editors" as const,
          header: "Editors",
          cell: ({ row: { original: skill } }) => (
            <SkillEditorsCell
              editors={isDustProvidedSkill(skill) ? null : skill.editors}
            />
          ),
          meta: { className: "hidden w-32 sm:table-cell" },
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
          meta: { className: "hidden w-32 sm:table-cell" },
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
    [onAgentClick, onRefresh, onSelect, owner]
  );

  // Show skeletons only when no rows are available; keep previous results during refreshes.
  if (isLoading && skills.length === 0) {
    return (
      <div role="status" aria-label="Loading skills">
        <DataTableSkeleton
          columns={columns}
          rowHeight={64}
          SkeletonCell={({ columnId, rowIndex }) => {
            switch (columnId) {
              case "select":
                return <LoadingBlock className="h-4 w-4 rounded-sm" />;
              case "name":
                return (
                  <AvatarCellSkeleton avatarClassName="h-9 w-9 rounded-lg">
                    <TextCellSkeleton
                      className={rowIndex % 2 === 0 ? "h-4 w-32" : "h-4 w-40"}
                    />
                  </AvatarCellSkeleton>
                );
              case "availability":
                return <ChipCellSkeleton />;
              case "usedBy":
                return <LoadingBlock className="mx-auto h-5 w-14 rounded-md" />;
              case "usage":
                return <TextCellSkeleton className="w-8" />;
              case "editors":
                return (
                  <div className="flex -space-x-2">
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                    <LoadingBlock className="h-7 w-7 rounded-full" />
                  </div>
                );
              case "updatedAt":
                return <TextCellSkeleton className="w-20" />;
              case "actions":
                return <LoadingBlock className="h-6 w-6 rounded-md" />;
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
    <PageSkillIdsContext.Provider value={pageSkillIds}>
      <DataTable
        data={skills.map((skill) => ({
          ...skill,
          onClick: () => onSelect(skill.sId),
        }))}
        columns={columns}
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
    </PageSkillIdsContext.Provider>
  );
}
