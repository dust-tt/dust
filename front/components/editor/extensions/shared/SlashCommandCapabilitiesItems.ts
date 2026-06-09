import type { SlashCommand } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  DUST_PROVIDED_SKILL_LABEL,
  getSkillAvatarIconForSkill,
  isDustProvidedSkill,
} from "@app/lib/skill";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";

export const SELECT_SKILL_SLASH_COMMAND_ACTION = "select-skill";
export const SELECT_TOOL_SLASH_COMMAND_ACTION = "select-tool";

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

export function matchesSlashCommandCapabilityQuery({
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

export function sortSlashCommandCapabilityMatches<
  T extends { sortName: string },
>({ items, normalizedQuery }: { items: T[]; normalizedQuery: string }): T[] {
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

export function getToolSlashCommandLabel(tool: SlashCommandToolSuggestion) {
  return tool.label ?? getMcpServerViewDisplayName(tool);
}

export function getSkillSlashCommandItem(
  skill: SlashCommandSkillSuggestion,
  { sectionLabel }: { sectionLabel?: string } = {}
): SlashCommand {
  const isDustProvided = isDustProvidedSkill(skill);
  const tooltipDescription = isDustProvided
    ? skill.userFacingDescription
      ? `${skill.userFacingDescription}\n\n${DUST_PROVIDED_SKILL_LABEL}`
      : DUST_PROVIDED_SKILL_LABEL
    : skill.userFacingDescription;

  return {
    action: SELECT_SKILL_SLASH_COMMAND_ACTION,
    data: {
      skill,
    },
    description: skill.userFacingDescription,
    icon: getSkillAvatarIconForSkill(skill),
    id: skill.sId,
    label: skill.name,
    sectionLabel,
    tooltip: tooltipDescription
      ? { description: tooltipDescription }
      : undefined,
  };
}

export function getToolSlashCommandItem(
  tool: SlashCommandToolSuggestion,
  { sectionLabel }: { sectionLabel?: string } = {}
): SlashCommand {
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
    icon: () => getAvatar(tool.server),
    id: tool.sId,
    label: name,
    sectionLabel,
    tooltip: description
      ? {
          description,
        }
      : undefined,
  };
}
