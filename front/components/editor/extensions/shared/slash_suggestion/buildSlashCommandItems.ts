import {
  type CapabilitySearchIndexItem,
  getSkillSlashCommandItem,
  getToolSlashCommandItem,
  getToolSlashCommandLabel,
  type SlashCommandSkillSuggestion,
  type SlashCommandToolSuggestion,
  searchCapabilityIndex,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
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

type CapabilitySlashCommandSearchItem = CapabilitySearchIndexItem &
  (
    | {
        kind: "skill";
        skill: SlashCommandSkillSuggestion;
      }
    | {
        kind: "tool";
        tool: SlashCommandToolSuggestion;
      }
  );

export function buildCapabilitySlashCommandIndex({
  excludeSkillId,
  skillFilter,
  skills,
  toolFilter,
  tools,
}: {
  excludeSkillId?: string | null;
  skillFilter?: (skill: SlashCommandSkillSuggestion) => boolean;
  skills: SlashCommandSkillSuggestion[];
  toolFilter?: (tool: SlashCommandToolSuggestion) => boolean;
  tools: SlashCommandToolSuggestion[];
}): CapabilitySlashCommandSearchItem[] {
  const index: CapabilitySlashCommandSearchItem[] = [];

  for (const skill of skills) {
    if (skill.sId === excludeSkillId || !(skillFilter?.(skill) ?? true)) {
      continue;
    }

    index.push({
      kind: "skill",
      normalizedDescription: skill.userFacingDescription?.toLowerCase(),
      skill,
      sortName: skill.name.toLowerCase(),
    });
  }

  for (const tool of tools) {
    if (!(toolFilter?.(tool) ?? true)) {
      continue;
    }

    index.push({
      kind: "tool",
      normalizedDescription: getMcpServerViewDescription(tool)?.toLowerCase(),
      tool,
      sortName: getToolSlashCommandLabel(tool).toLowerCase(),
    });
  }

  return index;
}

export function searchCapabilitySlashCommandIndex({
  excludedToolIds,
  index,
  query,
}: {
  excludedToolIds?: ReadonlySet<string>;
  index: CapabilitySlashCommandSearchItem[];
  query: string;
}): SlashCommand[] {
  const searchableIndex = excludedToolIds
    ? index.filter(
        (item) => item.kind !== "tool" || !excludedToolIds.has(item.tool.sId)
      )
    : index;
  const matches = searchCapabilityIndex({
    items: searchableIndex,
    query,
  }).items;

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
