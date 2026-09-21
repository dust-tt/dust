import { SkillSearchActionsMenu } from "@app/components/skills/SkillSearchActionsMenu";
import { getSkillAvatarIcon, isDustProvidedSkill } from "@app/lib/skill";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { Chip, DataTable, Tooltip } from "@dust-tt/sparkle";
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
        cell: ({ row: { original: skill } }) => {
          const SkillAvatar = getSkillAvatarIcon(skill);
          return (
            <DataTable.CellContent>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 py-3 text-left"
              >
                <SkillAvatar />
                <div className="min-w-0 flex-1">
                  <div className="heading-sm truncate text-foreground">
                    {skill.name}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {skill.userFacingDescription}
                  </div>
                </div>
              </button>
            </DataTable.CellContent>
          );
        },
        meta: { className: "w-full" },
      },
      {
        id: "availability",
        header: "Availability",
        cell: ({ row: { original: skill } }) => {
          const display = SKILL_AVAILABILITY_DISPLAY[skill.availability];
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
        cell: ({ row: { original: skill } }) => {
          const items = isDustProvidedSkill(skill)
            ? [{ name: "Dust", visual: DUST_AVATAR_URL, isRounded: false }]
            : skill.editors.map((editor) => ({
                name: editor.fullName,
                visual: editor.image,
                isRounded: true,
              }));
          return (
            <DataTable.CellContent avatarStack={{ items, nbVisibleItems: 4 }} />
          );
        },
        meta: { className: "w-32" },
      },
      {
        id: "updatedAt",
        header: "Last edited",
        cell: ({ row: { original: skill } }) => (
          <DataTable.BasicCellContent
            label={
              skill.updatedAt === null
                ? "-"
                : formatTimestampToFriendlyDate(skill.updatedAt, "compact")
            }
            tooltip={
              skill.updatedAt === null
                ? undefined
                : formatTimestampToFriendlyDate(skill.updatedAt, "long")
            }
          />
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
