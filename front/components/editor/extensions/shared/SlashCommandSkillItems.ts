import type { SlashCommand } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";

export const SELECT_SKILL_SLASH_COMMAND_ACTION = "select-skill";

export function matchesSlashCommandQuery({
  label,
  query,
}: {
  label: string;
  query: string;
}) {
  if (query.length === 0) {
    return true;
  }

  return subFilter(query, label.toLowerCase());
}

export function sortSlashCommandMatches<T extends { sortName: string }>({
  items,
  normalizedQuery,
}: {
  items: T[];
  normalizedQuery: string;
}): T[] {
  return items.toSorted((a, b) => {
    if (normalizedQuery.length > 0) {
      return (
        compareForFuzzySort(normalizedQuery, a.sortName, b.sortName) ||
        a.sortName.localeCompare(b.sortName)
      );
    }

    return a.sortName.localeCompare(b.sortName);
  });
}

export function filterSkillsForSlashSuggestions({
  query,
  skills,
}: {
  query: string;
  skills: SkillWithoutInstructionsAndToolsType[];
}): SkillWithoutInstructionsAndToolsType[] {
  const normalizedQuery = query.trim().toLowerCase();

  return sortSlashCommandMatches({
    normalizedQuery,
    items: skills
      .filter((skill) =>
        matchesSlashCommandQuery({
          label: skill.name,
          query: normalizedQuery,
        })
      )
      .map((skill) => ({
        skill,
        sortName: skill.name.toLowerCase(),
      })),
  }).map(({ skill }) => skill);
}

export function getSkillSlashCommandItem(
  skill: SkillWithoutInstructionsAndToolsType,
  { sectionLabel }: { sectionLabel?: string } = {}
): SlashCommand {
  return {
    action: SELECT_SKILL_SLASH_COMMAND_ACTION,
    data: {
      skill: {
        icon: skill.icon,
        id: skill.sId,
        name: skill.name,
      },
    },
    description: skill.userFacingDescription,
    icon: getSkillAvatarIcon(skill.icon),
    id: skill.sId,
    label: skill.name,
    sectionLabel,
    tooltip: skill.userFacingDescription
      ? {
          description: skill.userFacingDescription,
        }
      : undefined,
  };
}
