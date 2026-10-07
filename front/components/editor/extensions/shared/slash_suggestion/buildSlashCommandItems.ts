import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
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
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { defaultLocaleI18n } from "@app/lib/i18n/i18n";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import { compareForAutocompleteSort, removeDiacritics } from "@app/lib/utils";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { MessageDescriptor } from "@lingui/core";

type Translate = (descriptor: MessageDescriptor) => string;

const normalizeSlashCommandSearchText = (text: string) =>
  removeDiacritics(text).toLowerCase();

function getSlashCommandSearchText(command: SlashCommand): string[] {
  return removeNulls([
    command.label,
    command.description,
    command.tooltip?.description,
    ...(command.searchText ?? []),
  ]);
}

/**
 * @cc [owner:sfriquet,label:product] default-locale-search-text
 * The returned command MUST be `createCommand(t)` with `searchText` holding its label,
 * description and tooltip description rendered in `DEFAULT_LOCALE`, so that
 * `filterSlashCommandItems` matches English queries whatever the active locale.
 */
export function withDefaultLocaleSearchText<T extends SlashCommand>(
  createCommand: (t: Translate) => T,
  t: Translate
): T {
  const command = createCommand(t);
  const defaultLocaleCommand = createCommand((descriptor) =>
    defaultLocaleI18n._(descriptor)
  );

  return {
    ...command,
    searchText: getSlashCommandSearchText(defaultLocaleCommand),
  };
}

/**
 * @cc [owner:sfriquet,label:product] diacritic-insensitive-match
 * An item MUST be kept when the trimmed query is empty, or when it is a substring of the item's
 * label, description, tooltip description or one of its `searchText` entries, compared
 * case-insensitively and ignoring diacritics on both sides ("modele" matches "modèle").
 */
export function filterSlashCommandItems(
  items: SlashCommand[],
  query: string
): SlashCommand[] {
  const normalizedQuery = normalizeSlashCommandSearchText(query.trim());
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((command) =>
    getSlashCommandSearchText(command).some((text) =>
      normalizeSlashCommandSearchText(text).includes(normalizedQuery)
    )
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

  const normalizedQuery = query.trim();
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
          return compareForAutocompleteSort(
            normalizedQuery,
            a.sortName,
            b.sortName
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
