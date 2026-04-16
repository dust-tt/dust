import type {
  SlashCommand,
  SlashCommandDropdownRef,
} from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { getSkillAvatarIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { forwardRef, useMemo } from "react";

const MAX_SKILL_SUGGESTIONS = 10;

export function filterInputBarSkills({
  query,
  selectedSkillIds,
  skills,
}: {
  query: string;
  selectedSkillIds: Set<string>;
  skills: SkillType[];
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
  {
    anchorRect: DOMRect;
    onClose: () => void;
    onSkillSelect: (skill: SkillType) => void;
    skills: SkillType[];
  }
>(({ anchorRect, onClose, onSkillSelect, skills }, ref) => {
  const skillItems = useMemo<SlashCommand[]>(
    () =>
      skills.map((skill) => ({
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
    [skills]
  );

  const skillsById = useMemo(
    () => new Map(skills.map((skill) => [skill.sId, skill])),
    [skills]
  );

  return (
    <SlashCommandDropdown
      ref={ref}
      items={skillItems}
      command={(item) => {
        const skill = skillsById.get(item.id);

        if (skill) {
          onSkillSelect(skill);
        }
      }}
      clientRect={() => anchorRect}
      emptyMessage="No skills found"
      header="Skills"
      onClose={onClose}
    />
  );
});

InputBarSkillSuggestionDropdown.displayName = "InputBarSkillSuggestionDropdown";
