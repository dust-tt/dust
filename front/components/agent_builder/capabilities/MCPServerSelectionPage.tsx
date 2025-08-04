import { BookOpenIcon, Card, Icon, Spinner } from "@dust-tt/sparkle";
import { ActionIcons } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { TrashIcon } from "@dust-tt/sparkle";
import { PlusIcon } from "@dust-tt/sparkle";
import { SearchInput } from "@dust-tt/sparkle";
import React from "react";

import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { isCustomServerIconType } from "@app/lib/actions/mcp_icons";
import { InternalActionIcons } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { MCPServerViewTypeType } from "@app/lib/api/mcp";

const MCP_TOOLS_FILTERS = ["All tools", "Capabilities", "Other tools"];

type McpToolsFilterType = (typeof MCP_TOOLS_FILTERS)[number];

const McpServerViewTypeMatch: Record<
  McpToolsFilterType,
  MCPServerViewTypeType[]
> = {
  "All tools": ["remote", "internal"],
  Capabilities: ["internal"],
  "Other tools": ["remote"],
};

interface MCPServerSelectionPageProps {
  mcpServerViews: MCPServerViewTypeWithLabel[];
  onItemClick: (serverName: string) => void;
  isMCPServerViewsLoading: boolean;
  selectedServers: MCPServerViewType[];
}

export function MCPServerSelectionPage({
  mcpServerViews = [],
  onItemClick,
  isMCPServerViewsLoading,
  selectedServers,
}: MCPServerSelectionPageProps) {
  const [filteredServerViews, setFilteredServerViews] =
    React.useState<MCPServerViewTypeWithLabel[]>(mcpServerViews);
  const [filter, setFilter] = React.useState<McpToolsFilterType>("All tools");
  const [searchTerm, setSearchTerm] = React.useState("");

  if (isMCPServerViewsLoading) {
    return (
      <div className="flex h-40 w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const handleFilterClick = (filter: string) => {
    setFilter(filter);
    const m = McpServerViewTypeMatch[filter];
    setFilteredServerViews(
      mcpServerViews.filter((v) => m.includes(v.serverType))
    );
  };

  const handleSearchTermChange = (term: string) => {
    setSearchTerm(term);
    setFilteredServerViews(
      mcpServerViews.filter((v) => v.name?.startsWith(term))
    );
  };

  return (
    <div className="space-y-4">
      <SearchInput
        value={searchTerm}
        onChange={handleSearchTermChange}
        name="Search"
      />
      <div className="flex flex-row flex-wrap gap-2">
        {MCP_TOOLS_FILTERS.map((f) => (
          <Button
            label={f}
            variant={filter == f ? "primary" : "outline"}
            key={f}
            size="xs"
            onClick={() => handleFilterClick(f)}
          />
        ))}
      </div>
      <h2 className="text-lg font-semibold">Capabilities</h2>
      <div className="grid grid-cols-2 gap-4">
        {filteredServerViews.map((view) => {
          const isSelected = selectedServers
            .map((s) => s.name)
            .includes(view.server.name);

          return (
            <Card
              key={view.id}
              variant={isSelected ? "secondary" : "primary"}
              onClick={() => onItemClick(view.server.name)}
            >
              <div className="flex w-full flex-col gap-1 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Icon
                    visual={
                      isCustomServerIconType(view.server.icon)
                        ? ActionIcons[view.server.icon]
                        : InternalActionIcons[view.server.icon] || BookOpenIcon
                    }
                    size="sm"
                  />
                  <span className="text-sm font-medium">{view.label}</span>
                </div>
                <div className="line-clamp-2 w-full text-xs text-gray-600">
                  {getMcpServerViewDescription(view)}
                </div>
                <div>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={isSelected ? TrashIcon : PlusIcon}
                    label={isSelected ? "Remove" : "Add"}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
