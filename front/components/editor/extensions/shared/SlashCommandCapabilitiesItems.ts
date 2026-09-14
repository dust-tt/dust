import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewLightType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { compareForAutocompleteSort, subFilter } from "@app/lib/utils";
import type { GetSkillsResponseBody } from "@app/types/api/skills";
import React from "react";

export const SELECT_SKILL_SLASH_COMMAND_ACTION = "select-skill";
export const SELECT_TOOL_SLASH_COMMAND_ACTION = "select-tool";
export const RUN_COMMAND_SLASH_COMMAND_ACTION = "run-command";
export const INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION = "insert-knowledge-node";
export const MAX_RENDERED_CAPABILITY_ITEMS = 50;

export interface CapabilitySearchIndexItem {
  isFavorite?: boolean;
  normalizedDescription?: string;
  searchAliases?: readonly string[];
  sortGroup?: number;
  sortName: string;
}

interface CapabilityNameMatch {
  isLowPriorityAlias: boolean;
  name: string;
}

function getBestMatchingName({
  item,
  normalizedQuery,
}: {
  item: CapabilitySearchIndexItem;
  normalizedQuery: string;
}): CapabilityNameMatch | null {
  const aliases = item.searchAliases ?? [];
  const exactAlias = aliases.find(
    (alias) => alias.toLowerCase() === normalizedQuery
  );
  if (exactAlias) {
    return { isLowPriorityAlias: false, name: exactAlias };
  }

  if (subFilter(normalizedQuery, item.sortName.toLowerCase())) {
    return { isLowPriorityAlias: false, name: item.sortName };
  }

  let bestAlias: string | null = null;
  for (const alias of aliases) {
    if (!subFilter(normalizedQuery, alias.toLowerCase())) {
      continue;
    }
    if (
      bestAlias === null ||
      compareForAutocompleteSort(normalizedQuery, alias, bestAlias) < 0
    ) {
      bestAlias = alias;
    }
  }

  return bestAlias ? { isLowPriorityAlias: true, name: bestAlias } : null;
}

export function searchCapabilityIndex<T extends CapabilitySearchIndexItem>({
  items,
  query,
  limit = MAX_RENDERED_CAPABILITY_ITEMS,
}: {
  items: T[];
  query: string;
  limit?: number;
}): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matches: { item: T; matchedName: CapabilityNameMatch | null }[] = [];

  for (const item of items) {
    const matchedName =
      normalizedQuery.length === 0
        ? { isLowPriorityAlias: false, name: item.sortName }
        : getBestMatchingName({ item, normalizedQuery });
    const descriptionMatches =
      normalizedQuery.length > 0 &&
      item.normalizedDescription !== undefined &&
      subFilter(normalizedQuery, item.normalizedDescription);

    if (matchedName !== null || descriptionMatches) {
      matches.push({ item, matchedName });
    }
  }

  const sortedMatches = matches.toSorted((a, b) => {
    const groupComparison = (a.item.sortGroup ?? 0) - (b.item.sortGroup ?? 0);
    if (groupComparison !== 0) {
      return groupComparison;
    }

    const aIsFavorite = a.item.isFavorite ?? false;
    const bIsFavorite = b.item.isFavorite ?? false;
    const favoriteComparison =
      aIsFavorite === bIsFavorite ? 0 : aIsFavorite ? -1 : 1;

    if (normalizedQuery.length === 0) {
      return (
        favoriteComparison || a.item.sortName.localeCompare(b.item.sortName)
      );
    }

    const aNameMatches = a.matchedName !== null;
    const bNameMatches = b.matchedName !== null;
    if (aNameMatches !== bNameMatches) {
      return aNameMatches ? -1 : 1;
    }

    if (a.matchedName !== null && b.matchedName !== null) {
      return (
        Number(a.matchedName.isLowPriorityAlias) -
          Number(b.matchedName.isLowPriorityAlias) ||
        favoriteComparison ||
        compareForAutocompleteSort(
          normalizedQuery,
          a.matchedName.name,
          b.matchedName.name
        ) ||
        a.item.sortName.localeCompare(b.item.sortName)
      );
    }

    return favoriteComparison || a.item.sortName.localeCompare(b.item.sortName);
  });

  return sortedMatches.slice(0, limit).map(({ item }) => item);
}

export type SlashCommandSkillSuggestion = Pick<
  GetSkillsResponseBody["skills"][number],
  | "editedBy"
  | "icon"
  | "isFavorite"
  | "name"
  | "requestedSpaceIds"
  | "sId"
  | "userFacingDescription"
>;

export type SlashCommandToolSuggestion<
  V extends MCPServerViewLightType = MCPServerViewLightType,
> = V & {
  label?: string;
};

// Typed variants of the generic SlashCommand carrying their selection payload in `data`. The
// dropdown treats `data` as opaque; consumers narrow items back with the guards below.
export interface SkillSlashCommand extends SlashCommand {
  action: typeof SELECT_SKILL_SLASH_COMMAND_ACTION;
  data: {
    skill: SlashCommandSkillSuggestion;
  };
}

export interface ToolSlashCommand<
  V extends MCPServerViewLightType = MCPServerViewLightType,
> extends SlashCommand {
  action: typeof SELECT_TOOL_SLASH_COMMAND_ACTION;
  data: {
    tool: {
      icon: string | null;
      id: string;
      name: string;
      view: V;
    };
  };
}

export interface RunCommandSlashCommand<TCommand = unknown>
  extends SlashCommand {
  action: typeof RUN_COMMAND_SLASH_COMMAND_ACTION;
  data: {
    command: TCommand;
  };
}

interface InsertKnowledgeSlashCommand extends SlashCommand {
  action: typeof INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION;
}

export function isSkillSlashCommand(
  item: SlashCommand
): item is SkillSlashCommand {
  return item.action === SELECT_SKILL_SLASH_COMMAND_ACTION;
}

export function isToolSlashCommand<
  V extends MCPServerViewLightType = MCPServerViewLightType,
>(item: SlashCommand): item is ToolSlashCommand<V> {
  return item.action === SELECT_TOOL_SLASH_COMMAND_ACTION;
}

export function isRunCommandSlashCommand<TCommand = unknown>(
  item: SlashCommand
): item is RunCommandSlashCommand<TCommand> {
  return item.action === RUN_COMMAND_SLASH_COMMAND_ACTION;
}

export function isInsertKnowledgeSlashCommand(
  item: SlashCommand
): item is InsertKnowledgeSlashCommand {
  return item.action === INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION;
}

export function matchesSlashCommandCapabilityQuery({
  description,
  label,
  query,
}: {
  description?: string;
  label: string;
  query: string;
}) {
  if (query.length === 0) {
    return true;
  }

  return (
    subFilter(query, label.toLowerCase()) ||
    (description !== undefined && subFilter(query, description.toLowerCase()))
  );
}

export function getToolSlashCommandLabel(tool: SlashCommandToolSuggestion) {
  return tool.label ?? getMcpServerViewDisplayName(tool);
}

export function getSkillSlashCommandItem(
  skill: SlashCommandSkillSuggestion
): SkillSlashCommand {
  return {
    action: SELECT_SKILL_SLASH_COMMAND_ACTION,
    data: {
      skill,
    },
    description: skill.userFacingDescription,
    hasDetails: true,
    icon: () => React.createElement(getSkillAvatarIcon(skill)),
    id: skill.sId,
    label: skill.name,
    tooltipLabel: skill.name,
  };
}

export function getToolSlashCommandItem<V extends MCPServerViewLightType>(
  tool: SlashCommandToolSuggestion<V>
): ToolSlashCommand<V> {
  const name = getToolSlashCommandLabel(tool);
  const description = getMcpServerViewDescription(tool);

  return {
    action: SELECT_TOOL_SLASH_COMMAND_ACTION,
    data: {
      tool: {
        icon: tool.server.icon,
        id: tool.sId,
        name,
        view: tool,
      },
    },
    description,
    hasDetails: true,
    icon: () => getAvatar(tool.server),
    id: tool.sId,
    label: name,
  };
}
