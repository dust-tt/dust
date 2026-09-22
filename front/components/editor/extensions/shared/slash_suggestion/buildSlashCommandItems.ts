import type {
  SlashCommandSkillSuggestion,
  SlashCommandToolSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import {
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  MAX_RENDERED_CAPABILITY_ITEMS,
  searchCapabilityIndex,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";

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

/**
 * @cc [owner:aubin-tchoi,label:product] server-ranked-skill-order
 * Search-backed skills retain server order without local matching or rescoring; matching
 * tools follow them. Legacy callers keep their existing local capability ranking.
 */
export function buildCapabilitySlashCommandItems<
  V extends MCPServerViewLightType,
>({
  excludeSkillId,
  query,
  skillFilter,
  skills,
  toolFilter,
  tools,
  useSearchRanking = false,
}: {
  excludeSkillId?: string | null;
  query: string;
  skillFilter?: (skill: SlashCommandSkillSuggestion) => boolean;
  skills: SlashCommandSkillSuggestion[];
  toolFilter?: (tool: SlashCommandToolSuggestion<V>) => boolean;
  tools: SlashCommandToolSuggestion<V>[];
  useSearchRanking?: boolean;
}): SlashCommand[] {
  const items = [
    ...skills
      .filter((skill) => skill.sId !== excludeSkillId)
      .filter((skill) => skillFilter?.(skill) ?? true)
      .map((skill) => ({
        isFavorite: skill.isFavorite ?? false,
        kind: "skill" as const,
        normalizedDescription: skill.userFacingDescription?.toLowerCase(),
        searchAliases: GLOBAL_SKILL_SEARCH_ALIASES[skill.sId],
        skill,
        sortName: skill.name,
      })),
    ...tools
      .filter((tool) => toolFilter?.(tool) ?? true)
      .map((tool) => ({
        kind: "tool" as const,
        normalizedDescription: getMcpServerViewDescription(tool)?.toLowerCase(),
        tool,
        sortName: getToolSlashCommandLabel(tool),
      })),
  ];

  const matches = useSearchRanking
    ? [
        ...items.filter((item) => item.kind === "skill"),
        ...searchCapabilityIndex({
          query,
          items: items.filter((item) => item.kind === "tool"),
        }),
      ].slice(0, MAX_RENDERED_CAPABILITY_ITEMS)
    : searchCapabilityIndex({ query, items });

  return removeNulls(
    matches.map((match) => {
      switch (match.kind) {
        case "skill":
          return getSkillSlashCommandItem(match.skill);
        case "tool":
          return getToolSlashCommandItem(match.tool);
        default:
          assertNeverAndIgnore(match);
          return null;
      }
    })
  );
}
