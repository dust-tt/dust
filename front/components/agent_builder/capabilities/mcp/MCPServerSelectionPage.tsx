import {
  ActionIcons,
  BookOpenIcon,
  Hoverable,
  ToolCard,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { WhitelistableFeature } from "@app/types";

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
      cardContainerClassName="h-36"
    />
  );
}

interface MCPServerCardProps {
  view: MCPServerViewTypeWithLabel;
  isSelected: boolean;
  onClick: () => void;
  onToolInfoClick: () => void;
  featureFlags?: WhitelistableFeature[];
}

function MCPServerCard({
  view,
  isSelected,
  onClick,
  onToolInfoClick,
  featureFlags,
}: MCPServerCardProps) {
  const toolsConfigurations = getMCPServerToolsConfigurations(
    view,
    featureFlags
  );
  const canAdd = toolsConfigurations.configurable !== "no" ? true : !isSelected;

  const icon = isCustomResourceIconType(view.server.icon)
    ? ActionIcons[view.server.icon]
    : InternalActionIcons[view.server.icon] || BookOpenIcon;

  // Create a ref to use as portal container for tooltips to prevent click blocking
  const containerRef = React.useRef<HTMLDivElement>(null);

  let description: React.ReactNode | null;
  if (view.server.documentationUrl) {
    description = (
      <>
        {getMcpServerViewDescription(view)} Find documentation{" "}
        <Hoverable
          href={view.server.documentationUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
          onClick={(e) => e.stopPropagation()}
        >
          here
        </Hoverable>
        .
      </>
    );
  } else {
    description = <>{getMcpServerViewDescription(view)}</>;
  }

  return (
    <div ref={containerRef}>
      <ToolCard
        icon={icon}
        label={view.label}
        description={description}
        isSelected={isSelected}
        canAdd={canAdd}
        onClick={onClick}
        cardContainerClassName="h-36"
        mountPortal
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        mountPortalContainer={containerRef.current || undefined}
        toolInfo={{
          label: "More info",
          onClick: onToolInfoClick,
        }}
      />
    </div>
  );
}

interface MCPServerSelectionPageProps {
  topMCPServerViews: MCPServerViewTypeWithLabel[];
  nonTopMCPServerViews: MCPServerViewTypeWithLabel[];
  onItemClick: (mcpServerView: MCPServerViewTypeWithLabel) => void;
  dataVisualization?: ActionSpecification | null;
  onDataVisualizationClick?: () => void;
  selectedToolsInSheet?: SelectedTool[];
  onToolDetailsClick?: (tool: SelectedTool) => void;
  featureFlags?: WhitelistableFeature[];
}

export function MCPServerSelectionPage({
  topMCPServerViews,
  nonTopMCPServerViews,
  onItemClick,
  dataVisualization,
  onDataVisualizationClick,
  selectedToolsInSheet = [],
  onToolDetailsClick,
  featureFlags,
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
  const hasTopViews = topMCPServerViews.length > 0;
  const hasNonTopViews = nonTopMCPServerViews.length > 0;
  const hasAnyResults =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    hasDataVisualization || hasTopViews || hasNonTopViews;

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
      <div className="flex flex-col gap-4 py-2">
        {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
        {((dataVisualization && onDataVisualizationClick) ||
          topMCPServerViews) && (
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
          {topMCPServerViews.map((view) => (
            <MCPServerCard
              key={view.id}
              view={view}
              isSelected={selectedMCPIds.has(view.sId)}
              onClick={() => onItemClick(view)}
              onToolInfoClick={() => {
                if (onToolDetailsClick) {
                  onToolDetailsClick({ type: "MCP", view });
                }
              }}
              featureFlags={featureFlags}
            />
          ))}
        </div>
        {nonTopMCPServerViews.length ? (
          <span className="text-lg font-semibold">Other tools</span>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {nonTopMCPServerViews.map((view) => (
            <MCPServerCard
              key={view.id}
              view={view}
              isSelected={selectedMCPIds.has(view.sId)}
              onClick={() => onItemClick(view)}
              onToolInfoClick={() => {
                if (onToolDetailsClick) {
                  onToolDetailsClick({ type: "MCP", view });
                }
              }}
              featureFlags={featureFlags}
            />
          ))}
        </div>
      </div>
    </>
  );
}
