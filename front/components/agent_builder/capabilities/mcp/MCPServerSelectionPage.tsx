import {
  ActionIcons,
  BookOpenIcon,
  Button,
  Card,
  CardGrid,
  Chip,
  cn,
  Icon,
  PlusIcon,
  SearchInput,
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
      className="h-32"
    >
      <div className="flex w-full flex-col justify-between gap-2 text-sm">
        <div>
          <div className="mb-2 flex h-7 items-center gap-2">
            <Icon visual={icon} size="sm" />
            <span className="text-sm font-medium">{label}</span>
            <div
              className={cn(
                FADE_TRANSITION_CLASSES,
                isSelected ? "opacity-100" : "opacity-0"
              )}
            >
              {isSelected && <Chip size="xs" color="green" label="ADDED" />}
            </div>
          </div>
          <div className="line-clamp-2 w-full text-xs text-gray-600">
            {description}
          </div>
        </div>
        <div
          className={cn(
            FADE_TRANSITION_CLASSES,
            canAdd ? "opacity-100" : "opacity-0"
          )}
        >
          {canAdd && (
            <Button size="xs" variant="outline" icon={PlusIcon} label="Add" />
          )}
        </div>
        {!canAdd && cantAddReason && (
          <div className="text-xs italic text-gray-600">{cantAddReason}</div>
        )}
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
    mcpServerViews
  );
  const allowedSpaces = getAllowedSpaces({
    spaces,
    spaceIdToActions,
  });

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
        <CardGrid>
          {dataVisualization &&
            onDataVisualizationClick &&
            showDataVisualization && (
              <DataVisualizationCard
                key="data-visualization"
                specification={dataVisualization}
                isSelected={isDataVisualizationSelected}
                onClick={onDataVisualizationClick}
              />
            )}
          {filteredServerViews.map((view) => (
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
        </CardGrid>
      )}
    </div>
  );
}
