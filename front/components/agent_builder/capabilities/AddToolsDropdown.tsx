import {
  Avatar,
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import assert from "assert";
import { uniqueId } from "lodash";
import { useState } from "react";
import type { FieldArrayWithId, UseFieldArrayAppend } from "react-hook-form";

import type {
  AgentBuilderAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
} from "@app/lib/actions/constants";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface AddToolsDropdownProps {
  tools: FieldArrayWithId<AgentBuilderFormData, "actions", "id">[];
  addTools: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  setSelectedAction: React.Dispatch<
    React.SetStateAction<AgentBuilderAction | null>
  >;
  defaultMCPServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMCPServerViews: MCPServerViewTypeWithLabel[];
  isMCPServerViewsLoading: boolean;
  dataVisualization: ActionSpecification | null;
}

export function AddToolsDropdown({
  addTools,
  setSelectedAction,
  defaultMCPServerViews,
  nonDefaultMCPServerViews,
  dataVisualization,
  isMCPServerViewsLoading,
}: AddToolsDropdownProps) {
  const [searchText, setSearchText] = useState("");
  const [filteredServerViews, setFilteredServerViews] = useState([
    ...defaultMCPServerViews,
    ...nonDefaultMCPServerViews,
  ]);
  const [filteredDataViz, setFilteredDataViz] = useState(dataVisualization);

  // Data Visualization is not an action but we show like an action in UI.
  const onClickDataVisualization = () => {
    if (!dataVisualization) {
      return;
    }

    // TODO: Extract it to a function
    addTools({
      id: uniqueId(),
      type: "DATA_VISUALIZATION",
      configuration: null,
      name: DEFAULT_DATA_VISUALIZATION_NAME,
      description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
      noConfigurationRequired: true,
    });
  };

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

  function onChangeSearchText(text: string) {
    setSearchText(text);
    const searchTerm = text.toLowerCase();
    setFilteredServerViews(
      [...defaultMCPServerViews, ...nonDefaultMCPServerViews].filter((view) =>
        view.label.toLowerCase().includes(searchTerm)
      )
    );

    setFilteredDataViz(() =>
      dataVisualization?.label.toLowerCase().includes(searchTerm)
        ? dataVisualization
        : null
    );
  }

  function onOpenChange(open: boolean) {
    if (!open) {
      // Delay slightly to avoid flickering when the dropdown is closed.
      setTimeout(() => {
        setSearchText("");
        setFilteredServerViews([]);
        setFilteredDataViz(null);
      }, 200);
    }
  }

  // TODO: handle the case which there is no more option to add.
  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label="Add tools"
          icon={BoltIcon}
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="md-w-100 w-80"
        collisionPadding={10}
        dropdownHeaders={
          <DropdownMenuSearchbar
            autoFocus
            name="search-tools"
            placeholder="Search Tools"
            value={searchText}
            onChange={onChangeSearchText}
          />
        }
      >
        {isMCPServerViewsLoading && (
          <div className="flex h-40 w-full items-center justify-center rounded-xl">
            <Spinner />
          </div>
        )}
        {!isMCPServerViewsLoading &&
          searchText.length > 0 &&
          (filteredServerViews.length === 0 && filteredDataViz === null ? (
            <DropdownMenuLabel label="No tools found" />
          ) : (
            <>
              <DropdownMenuLabel label="Search results" />
              {filteredServerViews.map((view) => (
                <MCPDropdownMenuItem
                  key={view.id}
                  view={view}
                  onClick={onClickMCPServer}
                />
              ))}
              {filteredDataViz && (
                <DataVisualizationDropdownItem
                  onClick={onClickDataVisualization}
                />
              )}
            </>
          ))}

        {!isMCPServerViewsLoading && searchText.length === 0 && (
          <>
            <DropdownMenuLabel label="Top tools" />
            {defaultMCPServerViews.map((view) => (
              <MCPDropdownMenuItem
                key={view.id}
                view={view}
                onClick={onClickMCPServer}
              />
            ))}
            {dataVisualization && (
              <DataVisualizationDropdownItem
                onClick={onClickDataVisualization}
              />
            )}
            {nonDefaultMCPServerViews.length > 0 && (
              <>
                <DropdownMenuLabel label="Other tools" />
                {nonDefaultMCPServerViews.map((view) => (
                  <MCPDropdownMenuItem
                    key={view.id}
                    view={view}
                    onClick={onClickMCPServer}
                  />
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface DataVisualizationDropdownItemProps {
  onClick: () => void;
}

function DataVisualizationDropdownItem({
  onClick,
}: DataVisualizationDropdownItemProps) {
  return (
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
      onClick={onClick}
    />
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
