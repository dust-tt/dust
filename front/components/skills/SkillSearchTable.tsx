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
  ChipCellSkeleton,
  DataTable,
  DataTableSkeleton,
  LoadingBlock,
  TextCellSkeleton,
} from "@dust-tt/sparkle";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";

// Leave room for Usage and Actions, then Editors/Last edited at sm, Availability at md and Used by
// at lg.
export const SKILL_SEARCH_NAME_COLUMN_WIDTH =
  "w-[calc(100%-9.5rem)] sm:w-[calc(100%-25.5rem)] md:w-[calc(100%-35.5rem)] lg:w-[calc(100%-43.5rem)]";

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
}

type SkillSearchRow = SkillListItemType & { onClick: () => void };

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
}: SkillSearchTableProps) {
  const { usedBy, isUsedByLoading } = useSkillsUsedBy({
    owner,
    skillIds: skills.map((skill) => skill.sId),
  });
  const columns = useMemo(
    () =>
      [
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
          cell: ({ row: { original: skill } }) => {
            const usage = usedBy?.[skill.sId];
            return (
              <div className="flex h-12 w-full items-center justify-center">
                {isUsedByLoading ? (
                  <LoadingBlock className="h-5 w-14 rounded-md" />
                ) : usage ? (
                  <UsedByButton
                    usage={usage}
                    onItemClick={onAgentClick}
                    onSkillClick={onSelect}
                  />
                ) : (
                  "-"
                )}
              </div>
            );
          },
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
    [isUsedByLoading, onAgentClick, onRefresh, onSelect, owner, usedBy]
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
    <DataTable
      data={skills.map((skill) => ({
        ...skill,
        onClick: () => onSelect(skill.sId),
      }))}
      columns={columns}
      getRowId={(skill) => skill.sId}
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
