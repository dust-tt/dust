import type { SlashCommand } from "@app/components/editor/extensions/skill_builder/SlashCommandDropdown";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

import {
  matchesSlashCommandQuery,
  sortSlashCommandMatches,
} from "./SlashCommandSkillItems";

export const SELECT_TOOL_SLASH_COMMAND_ACTION = "select-tool";

export type SlashCommandToolSuggestion = MCPServerViewType & {
  label?: string;
};

export function getToolSlashCommandLabel(tool: SlashCommandToolSuggestion) {
  return tool.label ?? getMcpServerViewDisplayName(tool);
}

export function filterToolsForSlashSuggestions({
  query,
  tools,
}: {
  query: string;
  tools: SlashCommandToolSuggestion[];
}): SlashCommandToolSuggestion[] {
  const normalizedQuery = query.trim().toLowerCase();

  return sortSlashCommandMatches({
    normalizedQuery,
    items: tools
      .filter((tool) =>
        matchesSlashCommandQuery({
          label: getToolSlashCommandLabel(tool),
          query: normalizedQuery,
        })
      )
      .map((tool) => ({
        sortName: getToolSlashCommandLabel(tool).toLowerCase(),
        tool,
      })),
  }).map(({ tool }) => tool);
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
