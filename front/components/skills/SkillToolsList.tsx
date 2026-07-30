import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { Tooltip } from "@dust-tt/sparkle";
import sortBy from "lodash/sortBy";
import { useMemo } from "react";

interface SkillToolsListProps {
  tools: MCPServerViewType[];
}

export function SkillToolsList({ tools }: SkillToolsListProps) {
  const sortedTools = useMemo(
    () => sortBy(tools.map(renderMCPServerView), "title"),
    [tools]
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {sortedTools.map((tool) => (
        <Tooltip
          key={tool.title}
          label={tool.description ?? tool.title}
          trigger={
            <div className="flex flex-row items-center gap-2">
              {tool.avatar}
              <div className="truncate">{tool.title}</div>
            </div>
          }
          tooltipTriggerAsChild
        />
      ))}
    </div>
  );
}

const renderMCPServerView = (view: MCPServerViewType) => ({
  title: getMcpServerViewDisplayName(view),
  description: getMcpServerViewDescription(view),
  avatar: getAvatar(view.server, "xs"),
});
