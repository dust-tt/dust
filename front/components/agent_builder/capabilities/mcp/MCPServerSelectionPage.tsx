import {
  ActionIcons,
  BookOpenIcon,
  Button,
  Card,
  Chip,
  cn,
  Icon,
  PlusIcon,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { useAgentBuilderFormActions } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsDialog";
import {
  DISABLED_REASON,
  getAllowedSpaces,
  getSpaceIdToActionsMap,
} from "@app/components/agent_builder/get_allowed_spaces";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import {
  InternalActionIcons,
  isCustomServerIconType,
} from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { removeNulls } from "@app/types";

const FADE_TRANSITION_CLASSES = "transition-opacity duration-300 ease-in-out";

interface BaseToolCardProps {
  icon: React.ComponentType;
  label: string;
  description: string;
  isSelected: boolean;
  canAdd: boolean;
  cantAddReason?: string;
  onClick: () => void;
}

function BaseToolCard({
  icon,
  label,
  description,
  isSelected,
  canAdd,
  cantAddReason,
  onClick,
}: BaseToolCardProps) {
  return (
    <Card
      variant={isSelected ? "secondary" : "primary"}
      onClick={canAdd ? onClick : undefined}
      disabled={!canAdd}
      className="h-20 p-3"
    >
      <div className="flex h-full w-full items-center justify-between gap-3">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Icon visual={icon} size="sm" />
            <span className="text-sm font-medium">{label}</span>
            {isSelected && (
              <Chip
                size="xs"
                color="green"
                label="ADDED"
                className={cn(FADE_TRANSITION_CLASSES, "opacity-100")}
              />
            )}
          </div>
          <div className="line-clamp-2 text-xs text-gray-600">
            {description}
          </div>
        </div>

        <div className="flex-shrink-0">
          {canAdd ? (
            <Button
              size="xs"
              variant="outline"
              icon={PlusIcon}
              label="Add"
              className={cn(FADE_TRANSITION_CLASSES, "opacity-100")}
            />
          ) : (
            cantAddReason && (
              <div className="text-xs italic text-gray-600">
                {cantAddReason}
              </div>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

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
    <BaseToolCard
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
  isSpaceAllowed: boolean;
  onClick: () => void;
}

function MCPServerCard({
  view,
  isSelected,
  isSpaceAllowed,
  onClick,
}: MCPServerCardProps) {
  const requirement = getMCPServerRequirements(view);
  const canAdd =
    isSpaceAllowed && (requirement.noRequirement ? !isSelected : true);

  const icon = isCustomServerIconType(view.server.icon)
    ? ActionIcons[view.server.icon]
    : InternalActionIcons[view.server.icon] || BookOpenIcon;

  return (
    <BaseToolCard
      icon={icon}
      label={view.label}
      description={getMcpServerViewDescription(view)}
      isSelected={isSelected}
      canAdd={canAdd}
      cantAddReason={!isSpaceAllowed ? DISABLED_REASON : undefined}
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
  selectedToolsInDialog?: SelectedTool[];
}

export function MCPServerSelectionPage({
  defaultMcpServerViews,
  nonDefaultMcpServerViews,
  onItemClick,
  dataVisualization,
  onDataVisualizationClick,
  selectedToolsInDialog = [],
}: MCPServerSelectionPageProps) {
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

  // Already added actions.
  const { actions: alreadyAddedActions } = useAgentBuilderFormActions();

  // Currently selected actions.
  const selectedActions = useMemo(() => {
    return removeNulls(
      selectedToolsInDialog.map((tool) =>
        tool.type === "MCP"
          ? tool.configuredAction ?? getDefaultMCPAction(tool.view)
          : null
      )
    );
  }, [selectedToolsInDialog]);

  const { spaces } = useSpacesContext();
  const spaceIdToActions = getSpaceIdToActionsMap(
    [...alreadyAddedActions, ...selectedActions],
    [...defaultMcpServerViews, ...nonDefaultMcpServerViews]
  );
  const allowedSpaces = getAllowedSpaces({
    spaces,
    spaceIdToActions,
  });

  const isDataVisualizationSelected = selectedToolsInDialog.some(
    (tool) => tool.type === "DATA_VISUALIZATION"
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {((dataVisualization && onDataVisualizationClick) ||
          defaultMcpServerViews) && (
          <span className="text-sm font-semibold">Top tools</span>
        )}
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
            isSpaceAllowed={
              !!allowedSpaces.find((space) => space.sId === view.spaceId)
            }
            onClick={() => onItemClick(view)}
          />
        ))}
        {nonDefaultMcpServerViews.length && (
          <span className="text-sm font-semibold">Other tools</span>
        )}
        {nonDefaultMcpServerViews.map((view) => (
          <MCPServerCard
            key={view.id}
            view={view}
            isSelected={selectedMCPIds.has(view.sId)}
            isSpaceAllowed={
              !!allowedSpaces.find((space) => space.sId === view.spaceId)
            }
            onClick={() => onItemClick(view)}
          />
        ))}
      </div>
    </>
  );
}
