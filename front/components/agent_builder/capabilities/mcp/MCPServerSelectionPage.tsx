import { Avatar, BookOpenIcon, Card, Chip, Icon } from "@dust-tt/sparkle";
import { ActionIcons } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { PlusIcon } from "@dust-tt/sparkle";
import { SearchInput } from "@dust-tt/sparkle";
import React from "react";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/MCPServerViewsDialog";
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
  dataVisualization?: ActionSpecification | null;
  onDataVisualizationClick?: () => void;
  selectedToolsInDialog?: SelectedTool[];
  onRemoveSelectedTool?: (tool: SelectedTool) => void;
}

export function MCPServerSelectionPage({
  mcpServerViews = [],
  onItemClick,
  dataVisualization,
  onDataVisualizationClick,
  selectedToolsInDialog = [],
  onRemoveSelectedTool,
}: MCPServerSelectionPageProps) {
  const [filteredServerViews, setFilteredServerViews] =
    React.useState<MCPServerViewTypeWithLabel[]>(mcpServerViews);
  const [showDataVisualization, setShowDataVisualization] =
    React.useState(true);

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

  const isDataVisualizationSelected = selectedToolsInDialog.some(
    (tool) => tool.type === "DATA_VISUALIZATION"
  );

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
              disabled={isDataVisualizationSelected}
              onClick={
                isDataVisualizationSelected
                  ? undefined
                  : onDataVisualizationClick
              }
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
                  {isDataVisualizationSelected && (
                    <Chip size="xs" color="green" label="ADDED" />
                  )}
                </div>
                <div className="line-clamp-2 w-full text-xs text-gray-600">
                  {dataVisualization.description}
                </div>
                <div>
                  {!isDataVisualizationSelected && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={PlusIcon}
                      label="Add"
                    />
                  )}
                </div>
              </div>
            </Card>
          )}
        {filteredServerViews.map((view) => {
          const isSelectedInDialog = selectedToolsInDialog.some(
            (tool) => tool.type === "MCP" && tool.view.sId === view.sId
          );

          return (
            <Card
              key={view.id}
              variant={isSelectedInDialog ? "secondary" : "primary"}
              onClick={isSelectedInDialog ? undefined : () => onItemClick(view)}
              disabled={isSelectedInDialog}
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
                  {isSelectedInDialog && (
                    <Chip size="xs" color="green" label="ADDED" />
                  )}
                </div>
                <div className="line-clamp-2 w-full text-xs text-gray-600">
                  {getMcpServerViewDescription(view)}
                </div>
                <div>
                  {!isSelectedInDialog && (
                    <Button
                      size="xs"
                      variant="outline"
                      icon={PlusIcon}
                      label="Add"
                    />
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selectedToolsInDialog.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Added tools</h2>
          <div className="flex flex-wrap gap-2">
            {selectedToolsInDialog.map((tool, index) => (
              <Chip
                key={index}
                label={
                  tool.type === "DATA_VISUALIZATION"
                    ? dataVisualization?.label || ""
                    : tool.type === "MCP"
                      ? tool.view.name || tool.view.server.name
                      : ""
                }
                onRemove={
                  onRemoveSelectedTool
                    ? () => onRemoveSelectedTool(tool)
                    : undefined
                }
                size="sm"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
