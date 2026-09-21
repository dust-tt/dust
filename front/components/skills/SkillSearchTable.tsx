import { getSkillAvatarIcon } from "@app/lib/skill";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import { Chip, DataTable, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

interface SkillSearchTableProps {
  skills: SkillListItemType[];
  onSelect: (skillId: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

type SkillSearchRow = SkillListItemType & { onClick: () => void };

export function SkillSearchTable({
  skills,
  onSelect,
  onLoadMore,
  isLoadingMore,
}: SkillSearchTableProps) {
  const columns: ColumnDef<SkillSearchRow>[] = [
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
  ];

  return (
    <DataTable
      data={skills.map((skill) => ({
        ...skill,
        onClick: () => onSelect(skill.sId),
      }))}
      columns={columns}
      getRowId={(skill) => skill.sId}
      columnsBreakpoints={{ availability: "md", updatedAt: "sm" }}
      onLoadMore={onLoadMore}
      isLoadingMore={isLoadingMore}
    />
  );
}
