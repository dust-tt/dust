import { getSkillAvatarIcon } from "@app/lib/skill";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type {
  SkillAvailability,
  SkillListItemType,
  SkillWithoutInstructionsAndToolsType,
} from "@app/types/assistant/skill_configuration";
import type { UserType } from "@app/types/user";
import { Chip, DataTable, Tooltip } from "@dust-tt/sparkle";

interface SkillNameCellProps {
  skill: Pick<
    SkillListItemType | SkillWithoutInstructionsAndToolsType,
    "name" | "icon" | "editedBy"
  >;
  description?: string;
}

export function SkillNameCell({ skill, description }: SkillNameCellProps) {
  const SkillAvatar = getSkillAvatarIcon(skill);

  return (
    <div className="flex flex-row items-center gap-2 py-3">
      <div>
        <SkillAvatar />
      </div>
      <div className="flex min-w-0 grow flex-col">
        <div className="heading-sm overflow-hidden truncate text-foreground">
          {skill.name}
        </div>
        {description !== undefined && (
          <div className="overflow-hidden truncate text-sm text-muted-foreground">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

interface SkillAvailabilityCellProps {
  availability: SkillAvailability;
}

export function SkillAvailabilityCell({
  availability,
}: SkillAvailabilityCellProps) {
  const display = SKILL_AVAILABILITY_DISPLAY[availability];

  return (
    <DataTable.CellContent>
      <Tooltip
        label={display.tooltip}
        trigger={<Chip size="xs" color={display.color} label={display.label} />}
      />
    </DataTable.CellContent>
  );
}

interface SkillEditorsCellProps {
  editors: Pick<UserType, "fullName" | "image">[] | null;
}

export function SkillEditorsCell({ editors }: SkillEditorsCellProps) {
  const items = editors
    ? editors.map((editor) => ({
        name: editor.fullName,
        visual: editor.image,
        isRounded: true,
      }))
    : // Only Dust-managed skills should have no editors.
      [{ name: "Dust", visual: DUST_AVATAR_URL, isRounded: false }];

  return <DataTable.CellContent avatarStack={{ items, nbVisibleItems: 4 }} />;
}

interface SkillLastEditedCellProps {
  updatedAt: number | null;
  emptyLabel?: string;
}

export function SkillLastEditedCell({
  updatedAt,
  emptyLabel = "",
}: SkillLastEditedCellProps) {
  return (
    <DataTable.BasicCellContent
      tooltip={
        updatedAt ? formatTimestampToFriendlyDate(updatedAt, "long") : ""
      }
      label={
        updatedAt
          ? formatTimestampToFriendlyDate(updatedAt, "compact")
          : emptyLabel
      }
    />
  );
}
