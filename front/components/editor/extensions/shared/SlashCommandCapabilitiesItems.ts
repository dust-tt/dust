import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getSkillAvatarIcon } from "@app/lib/skill";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";

export const SELECT_SKILL_SLASH_COMMAND_ACTION = "select-skill";
export const SELECT_TOOL_SLASH_COMMAND_ACTION = "select-tool";
export const RUN_COMMAND_SLASH_COMMAND_ACTION = "run-command";
export const INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION = "insert-knowledge-node";
export const ADD_CAPABILITY_SLASH_COMMAND_ACTION = "add-capability";

export type SlashCommandSkillSuggestion = Pick<
  SkillWithoutInstructionsAndToolsType,
  | "editedBy"
  | "icon"
  | "name"
  | "requestedSpaceIds"
  | "sId"
  | "userFacingDescription"
>;

export type SlashCommandToolSuggestion = MCPServerViewType & {
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

export interface ToolSlashCommand extends SlashCommand {
  action: typeof SELECT_TOOL_SLASH_COMMAND_ACTION;
  data: {
    tool: {
      icon: string | null;
      id: string;
      name: string;
      view: MCPServerViewType;
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

export interface InsertKnowledgeSlashCommand extends SlashCommand {
  action: typeof INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION;
}

export interface AddCapabilitySlashCommand extends SlashCommand {
  action: typeof ADD_CAPABILITY_SLASH_COMMAND_ACTION;
}

export function isSkillSlashCommand(
  item: SlashCommand
): item is SkillSlashCommand {
  return item.action === SELECT_SKILL_SLASH_COMMAND_ACTION;
}

export function isToolSlashCommand(
  item: SlashCommand
): item is ToolSlashCommand {
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

export function isAddCapabilitySlashCommand(
  item: SlashCommand
): item is AddCapabilitySlashCommand {
  return item.action === ADD_CAPABILITY_SLASH_COMMAND_ACTION;
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

export function sortSlashCommandCapabilityMatches<
  T extends { description?: string; sortName: string },
>({ items, normalizedQuery }: { items: T[]; normalizedQuery: string }): T[] {
  return items.toSorted((a, b) => {
    if (normalizedQuery.length === 0) {
      return a.sortName.localeCompare(b.sortName);
    }

    const aTitleMatch = subFilter(normalizedQuery, a.sortName);
    const bTitleMatch = subFilter(normalizedQuery, b.sortName);

    // Title matches rank above description-only matches.
    if (aTitleMatch !== bTitleMatch) {
      return aTitleMatch ? -1 : 1;
    }

    // Within title matches, use fuzzy sort on the title.
    if (aTitleMatch) {
      return (
        compareForFuzzySort(normalizedQuery, a.sortName, b.sortName) ||
        a.sortName.localeCompare(b.sortName)
      );
    }

    // Both are description-only matches: sort alphabetically by title.
    return a.sortName.localeCompare(b.sortName);
  });
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
    icon: getSkillAvatarIcon(skill),
    id: skill.sId,
    label: skill.name,
  };
}

export function getToolSlashCommandItem(
  tool: SlashCommandToolSuggestion
): ToolSlashCommand {
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
