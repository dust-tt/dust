import { ActionIcons, BookOpenIcon, ToolCard } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import {
  InternalActionIcons,
  isCustomServerIconType,
} from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface DataVisualizationCardProps {
  specification: ActionSpecification;
  isSelected: boolean;
  onClick: () => void;
}

function DataVisualizationCard({
  specification,
  isSelected,
  onClick,
}: DataVisualizationCardProps) {
  return (
    <ToolCard
      icon={specification.dropDownIcon}
      label={specification.label}
      description={specification.description}
      isSelected={isSelected}
      canAdd={!isSelected}
      onClick={onClick}
    />
  );
}

interface MCPServerCardProps {
  view: MCPServerViewTypeWithLabel;
  isSelected: boolean;
  onClick: () => void;
}

function MCPServerCard({ view, isSelected, onClick }: MCPServerCardProps) {
  const requirement = getMCPServerRequirements(view);
  const canAdd = requirement.noRequirement ? !isSelected : true;

  const icon = isCustomServerIconType(view.server.icon)
    ? ActionIcons[view.server.icon]
    : InternalActionIcons[view.server.icon] || BookOpenIcon;

  return (
    <ToolCard
      icon={icon}
      label={view.label}
      description={getMcpServerViewDescription(view)}
      isSelected={isSelected}
      canAdd={canAdd}
      onClick={onClick}
    />
  );
}

interface MCPServerSelectionPageProps {
  defaultMcpServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMcpServerViews: MCPServerViewTypeWithLabel[];
  onItemClick: (mcpServerView: MCPServerViewType) => void;
  dataVisualization?: ActionSpecification | null;
  onDataVisualizationClick?: () => void;
  selectedToolsInSheet?: SelectedTool[];
}

export function MCPServerSelectionPage({
  defaultMcpServerViews,
  nonDefaultMcpServerViews,
  onItemClick,
  dataVisualization,
  onDataVisualizationClick,
  selectedToolsInSheet = [],
}: MCPServerSelectionPageProps) {
  // Optimize selection lookup with Set-based approach
  const selectedMCPIds = useMemo(() => {
    const mcpIds = new Set<string>();
    selectedToolsInSheet.forEach((tool) => {
      if (tool.type === "MCP") {
        mcpIds.add(tool.view.sId);
      }
    });
    return mcpIds;
  }, [selectedToolsInSheet]);

  const isDataVisualizationSelected = selectedToolsInSheet.some(
    (tool) => tool.type === "DATA_VISUALIZATION"
  );

  const hasDataVisualization = dataVisualization && onDataVisualizationClick;
  const hasDefaultViews = defaultMcpServerViews.length > 0;
  const hasNonDefaultViews = nonDefaultMcpServerViews.length > 0;
  const hasAnyResults =
    hasDataVisualization || hasDefaultViews || hasNonDefaultViews;

  if (!hasAnyResults) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="px-4 text-center">
          <div className="mb-2 text-lg font-medium text-foreground">
            No tool matches your search
          </div>
          <div className="max-w-sm text-muted-foreground">
            No tools found. Try a different search term.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {((dataVisualization && onDataVisualizationClick) ||
          defaultMcpServerViews) && (
          <span className="text-lg font-semibold">Top tools</span>
        )}
        <div className="grid grid-cols-2 gap-3">
          {dataVisualization && onDataVisualizationClick && (
            <DataVisualizationCard
              key="data-visualization"
              specification={dataVisualization}
              isSelected={isDataVisualizationSelected}
              onClick={onDataVisualizationClick}
            />
          )}
          {defaultMcpServerViews.map((view) => (
            <MCPServerCard
              key={view.id}
              view={view}
              isSelected={selectedMCPIds.has(view.sId)}
              onClick={() => onItemClick(view)}
            />
          ))}
        </div>
        {nonDefaultMcpServerViews.length ? (
          <span className="text-lg font-semibold">Other tools</span>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {nonDefaultMcpServerViews.map((view) => (
            <MCPServerCard
              key={view.id}
              view={view}
              isSelected={selectedMCPIds.has(view.sId)}
              onClick={() => onItemClick(view)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
