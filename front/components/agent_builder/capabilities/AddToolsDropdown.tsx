import {
  Avatar,
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import assert from "assert";
import type { FieldArrayWithId, UseFieldArrayAppend } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderMCPAction,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { getDataVisualizationActionConfiguration } from "@app/components/assistant_builder/types";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";

type MCPServerViewTypeWithLabel = MCPServerViewType & { label: string };

interface AddToolsDropdownProps {
  tools: FieldArrayWithId<AgentBuilderFormData, "actions", "id">[];
  addTools: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  setSelectedAction: React.Dispatch<
    React.SetStateAction<AgentBuilderMCPAction | null>
  >;
  defaultMCPServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMCPServerViews: MCPServerViewTypeWithLabel[];
  isMCPServerViewsLoading: boolean;
}

export function AddToolsDropdown({
  tools,
  addTools,
  setSelectedAction,
  defaultMCPServerViews,
  nonDefaultMCPServerViews,
  isMCPServerViewsLoading,
}: AddToolsDropdownProps) {
  // Data Visualization is not an action but we show like an action in UI.
  function onClickDataVisualization() {
    const dataVisualizationConfig = getDataVisualizationActionConfiguration();
    if (!dataVisualizationConfig) {
      return;
    }

    addTools(dataVisualizationConfig);
  }

  // TODO: Add Reasoning logic here (see how it's done in Assistant Builder).
  function onClickMCPServer(mcpServerView: MCPServerViewType) {
    const action = getDefaultMCPAction(mcpServerView);
    assert(action);

    if (action.noConfigurationRequired) {
      addTools(action);
    } else {
      setSelectedAction(action);
    }
  }

  const hasDataVisualization = tools.some(
    (action) => action.type === "DATA_VISUALIZATION"
  );

  const addedMCPToolIds = tools
    .filter((action) => action.type === "MCP")
    .map((action) => action.configuration.mcpServerViewId);

  // We don't show the tools already added to the agent.
  const availableDefaultMCPServerViews = defaultMCPServerViews.filter(
    (view) => !addedMCPToolIds.includes(view.sId)
  );

  const availableNonDefaultMCPServerViews = nonDefaultMCPServerViews.filter(
    (view) => !addedMCPToolIds.includes(view.sId)
  );

  const hasAvailableTools =
    !hasDataVisualization ||
    availableDefaultMCPServerViews.length > 0 ||
    availableNonDefaultMCPServerViews.length > 0;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label="Add tools"
          icon={BoltIcon}
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="md-w-100 w-80" collisionPadding={10}>
        {isMCPServerViewsLoading && (
          <div className="flex h-40 w-full items-center justify-center rounded-xl">
            <Spinner />
          </div>
        )}
        {!isMCPServerViewsLoading &&
          (!hasAvailableTools ? (
            <DropdownMenuLabel label="All tools have been added" />
          ) : (
            <>
              <DropdownMenuLabel label="Available tools" />
              {!hasDataVisualization && (
                <DropdownMenuItem
                  truncateText
                  icon={
                    <Avatar
                      icon={DATA_VISUALIZATION_SPECIFICATION.dropDownIcon}
                      size="sm"
                    />
                  }
                  label={DATA_VISUALIZATION_SPECIFICATION.label}
                  description={DATA_VISUALIZATION_SPECIFICATION.description}
                  onClick={onClickDataVisualization}
                />
              )}
              {availableDefaultMCPServerViews.map((mcpServerView) => (
                <MCPDropdownMenuItem
                  key={`${mcpServerView.sId}-${mcpServerView.label || mcpServerView.id}`}
                  view={mcpServerView}
                  onClick={onClickMCPServer}
                />
              ))}
              {availableNonDefaultMCPServerViews.length > 0 && (
                <>
                  <DropdownMenuLabel label="Other tools" />
                  {availableNonDefaultMCPServerViews.map((mcpServerView) => (
                    <MCPDropdownMenuItem
                      key={`${mcpServerView.sId}-${mcpServerView.label || mcpServerView.id}`}
                      view={mcpServerView}
                      onClick={onClickMCPServer}
                    />
                  ))}
                </>
              )}
            </>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MCPDropdownMenuItem({
  view,
  onClick,
}: {
  view: MCPServerViewTypeWithLabel;
  onClick: (view: MCPServerViewType) => void;
}) {
  return (
    <DropdownMenuItem
      truncateText
      icon={getAvatar(view.server)}
      label={getMcpServerViewDisplayName(view)}
      description={view.server.description}
      onClick={() => onClick(view)}
    />
  );
}
