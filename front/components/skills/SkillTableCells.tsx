import { SKILL_AVAILABILITY_DISPLAY } from "@app/components/skills/skillAvailabilityDisplay";
import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import type { UserType } from "@app/types/user";
import { Chip, DataTable, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface SkillAvailabilityCellProps {
  availability: SkillAvailability;
}

export function SkillAvailabilityCell({
  availability,
}: SkillAvailabilityCellProps) {
  const { t } = useLingui();
  const display = SKILL_AVAILABILITY_DISPLAY[availability];

  return (
    <DataTable.CellContent>
      <Tooltip
        label={t(display.tooltip)}
        trigger={
          <Chip size="xs" color={display.color} label={t(display.label)} />
        }
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
