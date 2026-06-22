import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  matchesSlashCommandCapabilityQuery,
  type SlashCommandSkillSuggestion,
  type SlashCommandToolSuggestion,
  sortSlashCommandCapabilityMatches,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { assertNever } from "@app/types/shared/utils/assert_never";

export function filterSlashCommandItems(
  items: SlashCommand[],
  query: string
): SlashCommand[] {
  if (!query) {
    return items;
  }

  const normalizedQuery = query.toLowerCase();

  return items.filter(
    (command) =>
      command.label.toLowerCase().includes(normalizedQuery) ||
      command.description?.toLowerCase().includes(normalizedQuery) ||
      command.tooltip?.description.toLowerCase().includes(normalizedQuery)
  );
}

export function buildCapabilitySlashCommandItems({
  excludeSkillId,
  query,
  skillFilter,
  skills,
  toolFilter,
  tools,
}: {
  excludeSkillId?: string | null;
  query: string;
  skillFilter?: (skill: SlashCommandSkillSuggestion) => boolean;
  skills: SlashCommandSkillSuggestion[];
  toolFilter?: (tool: SlashCommandToolSuggestion) => boolean;
  tools: SlashCommandToolSuggestion[];
}): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();

  const matches = sortSlashCommandCapabilityMatches({
    normalizedQuery,
    items: [
      ...skills
        .filter((skill) => skill.sId !== excludeSkillId)
        .filter((skill) => skillFilter?.(skill) ?? true)
        .filter((skill) =>
          matchesSlashCommandCapabilityQuery({
            label: skill.name,
            query: normalizedQuery,
          })
        )
        .map((skill) => ({
          kind: "skill" as const,
          skill,
          sortName: skill.name.toLowerCase(),
        })),
      ...tools
        .filter((tool) => toolFilter?.(tool) ?? true)
        .filter((tool) =>
          matchesSlashCommandCapabilityQuery({
            label: getToolSlashCommandLabel(tool),
            query: normalizedQuery,
          })
        )
        .map((tool) => ({
          kind: "tool" as const,
          tool,
          sortName: getToolSlashCommandLabel(tool).toLowerCase(),
        })),
    ],
  });

  return matches.map((match) => {
    switch (match.kind) {
      case "skill":
        return getSkillSlashCommandItem(match.skill);
      case "tool":
        return getToolSlashCommandItem(match.tool);
      default:
        return assertNever(match);
    }
  });
}
