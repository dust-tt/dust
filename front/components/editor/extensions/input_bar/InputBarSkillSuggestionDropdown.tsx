import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillWithoutToolsType } from "@app/types/assistant/skill_configuration";
import type { SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useMemo } from "react";

const MAX_SKILL_SUGGESTIONS = 10;

export function filterInputBarSkills({
  query,
  selectedSkillIds,
  skills,
}: {
  query: string;
  selectedSkillIds: Set<string>;
  skills: SkillWithoutToolsType[];
}) {
  const normalizedQuery = query.trim().toLowerCase();

  return skills
    .filter((skill) => !selectedSkillIds.has(skill.sId))
    .filter((skill) => {
      if (normalizedQuery.length === 0) {
        return true;
      }

      return skill.name.toLowerCase().includes(normalizedQuery);
    })
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_SKILL_SUGGESTIONS);
}

export const InputBarSkillSuggestionDropdown = forwardRef<
  SlashCommandDropdownRef,
  Pick<
    SuggestionProps<SkillWithoutToolsType>,
    "clientRect" | "command" | "items"
  > & {
    onClose: () => void;
  }
>(({ clientRect, command, items, onClose }, ref) => {
  const skillItems = useMemo<SlashCommand[]>(
    () =>
      items.map((skill) => ({
        action: skill.sId,
        description: skill.userFacingDescription,
        icon: getSkillAvatarIcon(skill.icon),
        id: skill.sId,
        label: skill.name,
        tooltip: skill.userFacingDescription
          ? {
              description: skill.userFacingDescription,
            }
          : undefined,
      })),
    [items]
  );

  const skillsById = useMemo(
    () => new Map(items.map((skill) => [skill.sId, skill])),
    [items]
  );

  return (
    <SlashCommandDropdown
      ref={ref}
      items={skillItems}
      command={(item) => {
        const skill = skillsById.get(item.id);

        if (skill) {
          command(skill);
        }
      }}
      clientRect={clientRect}
      emptyMessage="No skills found"
      header="Skills"
      onClose={onClose}
    />
  );
});

InputBarSkillSuggestionDropdown.displayName = "InputBarSkillSuggestionDropdown";
