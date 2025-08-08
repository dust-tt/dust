import { Avatar, BookOpenIcon, Card, Chip, Icon } from "@dust-tt/sparkle";
import { ActionIcons } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { PlusIcon } from "@dust-tt/sparkle";
import { SearchInput } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
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

interface DataVisualizationCardProps {
  dataVisualization: ActionSpecification;
  onDataVisualizationClick: () => void;
  isSelected: boolean;
}

function DataVisualizationCard({
  dataVisualization,
  onDataVisualizationClick,
  isSelected,
}: DataVisualizationCardProps) {
  return (
    <Card
      variant="primary"
      disabled={isSelected}
      onClick={isSelected ? undefined : onDataVisualizationClick}
    >
      <div className="flex w-full flex-col gap-1 text-sm">
        <div className="mb-2 flex items-center gap-2">
          <Avatar
            icon={DATA_VISUALIZATION_SPECIFICATION.dropDownIcon}
            size="sm"
          />
          <span className="text-sm font-medium">{dataVisualization.label}</span>
          {isSelected && <Chip size="xs" color="green" label="ADDED" />}
        </div>
        <div className="line-clamp-2 w-full text-xs text-gray-600">
          {dataVisualization.description}
        </div>
        <div>
          {!isSelected && (
            <Button size="xs" variant="outline" icon={PlusIcon} label="Add" />
          )}
        </div>
      </div>
    </Card>
  );
}

interface MCPServerCardProps {
  view: MCPServerViewTypeWithLabel;
  onItemClick: (mcpServerView: MCPServerViewType) => void;
  isSelected: boolean;
}

function MCPServerCard({ view, onItemClick, isSelected }: MCPServerCardProps) {
  return (
    <Card
      variant={isSelected ? "secondary" : "primary"}
      onClick={isSelected ? undefined : () => onItemClick(view)}
      disabled={isSelected}
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
          {isSelected && <Chip size="xs" color="green" label="ADDED" />}
        </div>
        <div className="line-clamp-2 w-full text-xs text-gray-600">
          {getMcpServerViewDescription(view)}
        </div>
        <div>
          {!isSelected && (
            <Button size="xs" variant="outline" icon={PlusIcon} label="Add" />
          )}
        </div>
      </div>
    </Card>
  );
}

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

  // Optimize selection lookup with Set-based approach
  const selectedMCPIds = useMemo(() => {
    const mcpIds = new Set<string>();
    selectedToolsInDialog.forEach((tool) => {
      if (tool.type === "MCP") {
        mcpIds.add(tool.view.sId);
      }
    });
    return mcpIds;
  }, [selectedToolsInDialog]);

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
          (dataVisualization?.description
            ?.toLowerCase()
            .includes(searchTermLower) &&
            serverTypeMatch.includes("internal")) ||
          false
      );
    } else {
      setShowDataVisualization(serverTypeMatch.includes("internal"));
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

  const internalFilteredServerViews = filteredServerViews.filter(
    (view) => view.serverType === "internal"
  );

  const remoteFilteredServerViews = filteredServerViews.filter(
    (view) => view.serverType === "remote"
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
      {/* Capabilities Section - Internal servers only */}
      {(internalFilteredServerViews.length > 0 ||
        (dataVisualization &&
          onDataVisualizationClick &&
          showDataVisualization)) && (
        <>
          <h2 className="text-lg font-semibold">Capabilities</h2>
          <div className="grid grid-cols-2 gap-4">
            {dataVisualization &&
              onDataVisualizationClick &&
              showDataVisualization && (
                <DataVisualizationCard
                  dataVisualization={dataVisualization}
                  onDataVisualizationClick={onDataVisualizationClick}
                  isSelected={isDataVisualizationSelected}
                />
              )}
            {internalFilteredServerViews.map((view) => (
              <MCPServerCard
                key={view.id}
                view={view}
                onItemClick={onItemClick}
                isSelected={selectedMCPIds.has(view.sId)}
              />
            ))}
          </div>
        </>
      )}

      {/* Other tools Section - Remote servers only */}
      {remoteFilteredServerViews.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Other tools</h2>
          <div className="grid grid-cols-2 gap-4">
            {remoteFilteredServerViews.map((view) => (
              <MCPServerCard
                key={view.id}
                view={view}
                onItemClick={onItemClick}
                isSelected={selectedMCPIds.has(view.sId)}
              />
            ))}
          </div>
        </>
      )}

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
