import { SkillSearchActionsMenu } from "@app/components/skills/SkillSearchActionsMenu";
import {
  SkillAvailabilityCell,
  SkillEditorsCell,
  SkillLastEditedCell,
  SkillNameCell,
} from "@app/components/skills/SkillTableCells";
import { isDustProvidedSkill } from "@app/lib/skill";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { DataTable } from "@dust-tt/sparkle";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";

interface SkillSearchTableProps {
  owner: LightWorkspaceType;
  skills: SkillListItemType[];
  onSelect: (skillId: string) => void;
  onRefresh: () => void;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  hasMore: boolean;
}

type SkillSearchRow = SkillListItemType & { onClick: () => void };

export function SkillSearchTable({
  owner,
  skills,
  onSelect,
  onRefresh,
  pagination,
  setPagination,
  hasMore,
}: SkillSearchTableProps) {
  const columns = useMemo<ColumnDef<SkillSearchRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row: { original: skill } }) => (
          <DataTable.CellContent>
            <button type="button" className="w-full min-w-0 text-left">
              <SkillNameCell
                skill={skill}
                description={skill.userFacingDescription}
              />
            </button>
          </DataTable.CellContent>
        ),
        meta: { className: "w-full" },
      },
      {
        id: "availability",
        header: "Availability",
        cell: ({ row: { original: skill } }) => (
          <SkillAvailabilityCell availability={skill.availability} />
        ),
        meta: { className: "w-40" },
      },
      {
        id: "usage",
        header: "Usage",
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
        id: "editors",
        header: "Editors",
        cell: ({ row: { original: skill } }) => (
          <SkillEditorsCell
            editors={isDustProvidedSkill(skill) ? null : skill.editors}
          />
        ),
        meta: { className: "w-32" },
      },
      {
        id: "updatedAt",
        header: "Last edited",
        cell: ({ row: { original: skill } }) => (
          <SkillLastEditedCell updatedAt={skill.updatedAt} emptyLabel="-" />
        ),
        meta: { className: "w-32" },
      },
      {
        id: "actions",
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
    ],
    [onRefresh, onSelect, owner]
  );

  return (
    <DataTable
      data={skills.map((skill) => ({
        ...skill,
        onClick: () => onSelect(skill.sId),
      }))}
      columns={columns}
      getRowId={(skill) => skill.sId}
      columnsBreakpoints={{
        availability: "md",
        editors: "sm",
        updatedAt: "sm",
      }}
      pagination={pagination}
      setPagination={setPagination}
      totalRowCount={
        hasMore
          ? (pagination.pageIndex + 1) * pagination.pageSize + 1
          : pagination.pageIndex * pagination.pageSize + skills.length
      }
      rowCountIsCapped={hasMore}
      disablePaginationNumbers
    />
  );
}
