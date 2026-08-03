import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  type SlashCommandSkillSuggestion,
  type SlashCommandToolSuggestion,
  searchCapabilityIndex,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
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

export function buildCapabilitySlashCommandItems<
  V extends MCPServerViewLightType,
>({
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
  toolFilter?: (tool: SlashCommandToolSuggestion<V>) => boolean;
  tools: SlashCommandToolSuggestion<V>[];
}): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();

  const matches = searchCapabilityIndex({
    query: normalizedQuery,
    items: [
      ...skills
        .filter((skill) => skill.sId !== excludeSkillId)
        .filter((skill) => skillFilter?.(skill) ?? true)
        .map((skill) => ({
          isFavorite: skill.isFavorite ?? false,
          kind: "skill" as const,
          normalizedDescription: skill.userFacingDescription?.toLowerCase(),
          skill,
          sortName: skill.name.toLowerCase(),
        })),
      ...tools
        .filter((tool) => toolFilter?.(tool) ?? true)
        .map((tool) => ({
          kind: "tool" as const,
          normalizedDescription:
            getMcpServerViewDescription(tool)?.toLowerCase(),
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
