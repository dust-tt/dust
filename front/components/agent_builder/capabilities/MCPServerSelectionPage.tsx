import { Avatar, BookOpenIcon, Card, Icon } from "@dust-tt/sparkle";
import { ActionIcons } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { TrashIcon } from "@dust-tt/sparkle";
import { PlusIcon } from "@dust-tt/sparkle";
import { SearchInput } from "@dust-tt/sparkle";
import React from "react";

import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { isCustomServerIconType } from "@app/lib/actions/mcp_icons";
import { InternalActionIcons } from "@app/lib/actions/mcp_icons";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";
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
  onItemClick: (mcpServerView: MCPServerViewType) => void;
  selectedServers: MCPServerViewType[];
  dataVisualization?: ActionSpecification | null;
  onDataVisualizationClick?: () => void;
}

export function MCPServerSelectionPage({
  mcpServerViews = [],
  onItemClick,
  selectedServers,
  dataVisualization,
  onDataVisualizationClick,
}: MCPServerSelectionPageProps) {
  const [filteredServerViews, setFilteredServerViews] =
    React.useState<MCPServerViewTypeWithLabel[]>(mcpServerViews);
  const [showDataVisualization, setShowDataVisualization] =
    React.useState(true);

  React.useEffect(() => {
    setFilteredServerViews(mcpServerViews);
  }, [mcpServerViews]);
  const [filter, setFilter] = React.useState<McpToolsFilterType>("All tools");
  const [searchTerm, setSearchTerm] = React.useState("");

  const applyFiltersAndSearch = (
    newFilter?: string,
    newSearchTerm?: string
  ) => {
    const filterToUse = newFilter ?? filter;
    const searchToUse = newSearchTerm ?? searchTerm;
    const serverTypeMatch = McpServerViewTypeMatch[filterToUse];

    let filtered = mcpServerViews.filter((v) =>
      serverTypeMatch.includes(v.serverType)
    );

    if (searchToUse.trim()) {
      const searchTermLower = searchToUse.toLowerCase();
      filtered = filtered.filter(
        (view) =>
          view.label.toLowerCase().includes(searchTermLower) ||
          view.description?.toLowerCase().includes(searchTermLower) ||
          view.name?.toLowerCase().includes(searchTermLower)
      );

      setShowDataVisualization(
        dataVisualization?.label.toLowerCase().includes(searchTermLower) ||
          dataVisualization?.description
            ?.toLowerCase()
            .includes(searchTermLower) ||
          false
      );
    } else {
      setShowDataVisualization(true);
    }

    setFilteredServerViews(filtered);
  };

  const handleFilterClick = (newFilter: string) => {
    setFilter(newFilter);
    applyFiltersAndSearch(newFilter);
  };

  const handleSearchTermChange = (term: string) => {
    setSearchTerm(term);
    applyFiltersAndSearch(undefined, term);
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
        {dataVisualization &&
          onDataVisualizationClick &&
          showDataVisualization && (
            <Card
              key="data-visualization"
              variant="primary"
              onClick={onDataVisualizationClick}
            >
              <div className="flex w-full flex-col gap-1 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar
                    icon={DATA_VISUALIZATION_SPECIFICATION.dropDownIcon}
                    size="sm"
                  />
                  <span className="text-sm font-medium">
                    {dataVisualization.label}
                  </span>
                </div>
                <div className="line-clamp-2 w-full text-xs text-gray-600">
                  {dataVisualization.description}
                </div>
                <div>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={PlusIcon}
                    label="Add"
                  />
                </div>
              </div>
            </Card>
          )}
        {filteredServerViews.map((view) => {
          const isSelected = selectedServers
            .map((s) => s.name)
            .includes(view.server.name);

          return (
            <Card
              key={view.id}
              variant={isSelected ? "secondary" : "primary"}
              onClick={() => onItemClick(view)}
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
