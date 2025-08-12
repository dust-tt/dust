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
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";

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
      className="h-32"
    >
      <div className="flex w-full flex-col justify-between gap-2 text-sm">
        <div className="mb-2 flex h-7 items-center gap-2">
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
  const requirement = getMCPServerRequirements(view);
  const canAdd = requirement.noRequirement ? !isSelected : true;

  return (
    <Card
      key={view.id}
      variant={isSelected ? "secondary" : "primary"}
      onClick={!canAdd ? undefined : () => onItemClick(view)}
      disabled={!canAdd}
      className="h-32"
    >
      <div className="flex w-full flex-col justify-between gap-2 text-sm">
        <div>
          <div className="mb-2 flex h-7 items-center gap-2">
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
        </div>
        <div>
          {canAdd && (
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
}

export function MCPServerSelectionPage({
  mcpServerViews = [],
  onItemClick,
  dataVisualization,
  onDataVisualizationClick,
  selectedToolsInDialog = [],
}: MCPServerSelectionPageProps) {
  const [filteredServerViews, setFilteredServerViews] =
    React.useState<MCPServerViewTypeWithLabel[]>(mcpServerViews);
  const [showDataVisualization, setShowDataVisualization] =
    React.useState(true);

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

  const applySearch = (newSearchTerm?: string) => {
    const searchToUse = newSearchTerm ?? searchTerm;
    let filtered = mcpServerViews;

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

  const handleSearchTermChange = (term: string) => {
    setSearchTerm(term);
    applySearch(term);
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
      {(filteredServerViews.length > 0 ||
        (dataVisualization &&
          onDataVisualizationClick &&
          showDataVisualization)) && (
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
          {filteredServerViews.map((view) => (
            <MCPServerCard
              key={view.id}
              view={view}
              onItemClick={onItemClick}
              isSelected={selectedMCPIds.has(view.sId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
