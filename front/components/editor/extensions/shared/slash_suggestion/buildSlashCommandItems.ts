import type {
  SlashCommandSkillSuggestion,
  SlashCommandToolSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import {
  getBestMatchingName,
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
import { compareForAutocompleteSort } from "@app/lib/utils";
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
 * @cc [owner:aubin-tchoi,label:product] slash-search-alias-ranking
 * Search-backed skills MUST remain in the candidate list even when their names do not match
 * locally. Exact aliases MUST rank like names, and partial aliases below matching names.
 * Suggestions MUST display the skill's canonical name.
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

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useSearchRanking
    ? [
        ...items.filter((item) => item.kind === "skill"),
        ...searchCapabilityIndex({
          query,
          items: items.filter((item) => item.kind === "tool"),
        }),
      ]
        .toSorted((a, b) => {
          if (normalizedQuery.length === 0 && a.kind !== b.kind) {
            return a.kind === "skill" ? -1 : 1;
          }
          const aMatch = getBestMatchingName({ item: a, normalizedQuery });
          const bMatch = getBestMatchingName({ item: b, normalizedQuery });
          return (
            (aMatch && bMatch
              ? Number(aMatch.isLowPriorityAlias) -
                Number(bMatch.isLowPriorityAlias)
              : 0) ||
            compareForAutocompleteSort(
              normalizedQuery,
              aMatch?.name ?? a.sortName,
              bMatch?.name ?? b.sortName
            ) ||
            compareForAutocompleteSort(normalizedQuery, a.sortName, b.sortName)
          );
        })
        .slice(0, MAX_RENDERED_CAPABILITY_ITEMS)
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
