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
} from "@dust-tt/sparkle";
import assert from "assert";
import { uniqueId } from "lodash";
import { useState } from "react";

import type {
  ActionSpecificationWithType,
  AssistantBuilderActionType,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  getDataVisualizationAction,
  getDefaultActionConfiguration,
  getDefaultMCPServerActionConfiguration,
} from "@app/components/assistant_builder/types";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { asDisplayName } from "@app/types";

interface AddToolsDropdownProps {
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  defaultTools: ActionSpecificationWithType[];
  defaultMCPServerViews: (MCPServerViewType & { label: string })[];
  nonDefaultMCPServerViews: (MCPServerViewType & { label: string })[];
}

export function AddToolsDropdown({
  setEdited,
  setAction,
  setBuilderState,
  defaultTools,
  defaultMCPServerViews,
  nonDefaultMCPServerViews,
}: AddToolsDropdownProps) {
  const [searchText, setSearchText] = useState("");

  const [filteredDefaultTools, setFilteredDefaultTools] =
    useState(defaultTools);
  const [filteredDefaultMCPServerViews, setFilteredDefaultMCPServerViews] =
    useState(defaultMCPServerViews);
  const [
    filteredNonDefaultMCPServerViews,
    setFilteredNonDefaultMCPServerViews,
  ] = useState(nonDefaultMCPServerViews);

  function onOpenChange(open: boolean) {
    if (open) {
      // Update filtered list with the latest values when the dropdown is opened
      setFilteredDefaultTools(defaultTools);
      setFilteredDefaultMCPServerViews(defaultMCPServerViews);
      setFilteredNonDefaultMCPServerViews(nonDefaultMCPServerViews);
    } else {
      setSearchText("");
    }
  }

  function onChangeSearchText(text: string) {
    setSearchText(text);
    setFilteredDefaultTools(
      defaultTools.filter((tool) =>
        tool.label.toLowerCase().includes(text.toLowerCase())
      )
    );
    setFilteredDefaultMCPServerViews(
      defaultMCPServerViews.filter((view) =>
        view.label.toLowerCase().includes(text.toLowerCase())
      )
    );
    setFilteredNonDefaultMCPServerViews(
      nonDefaultMCPServerViews.filter((view) =>
        view.label.toLowerCase().includes(text.toLowerCase())
      )
    );
  }

  function onClickDefaultTool(toolType: AssistantBuilderActionType) {
    setEdited(true);
    const defaultAction = getDefaultActionConfiguration(toolType);
    assert(defaultAction);

    setAction({
      type: defaultAction.noConfigurationRequired ? "insert" : "pending",
      action: defaultAction,
    });
  }

  // Data visualization is not an action, but we need to show it in the UI like an action.
  // So we need to set visualizationEnabled true and add it as an action.
  function onClickDataVisualization() {
    setEdited(true);
    setBuilderState((state) => ({
      ...state,
      visualizationEnabled: true,
    }));

    const defaultDataVisualizationAction = getDataVisualizationAction();

    setAction({
      type: "insert",
      action: defaultDataVisualizationAction,
    });
  }

  function onClickMCPServer(selectedView: MCPServerViewType) {
    setEdited(true);
    const action = getDefaultMCPServerActionConfiguration(selectedView);
    assert(action);

    setAction({
      type: action.noConfigurationRequired ? "insert" : "pending",
      action: {
        ...action,
        id: uniqueId(),
      },
    });
  }

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label="Add tools"
          data-gtm-label="toolAddingButton"
          data-gtm-location="toolsPanel"
          icon={BoltIcon}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="md-w-[25rem] w-[20rem]"
        align="start"
        collisionPadding={10}
        dropdownHeaders={
          <>
            <DropdownMenuSearchbar
              autoFocus
              name="search-tools"
              placeholder="Search Tools"
              value={searchText}
              onChange={onChangeSearchText}
            />
          </>
        }
      >
        {searchText.length > 0 &&
          filteredDefaultTools.length === 0 &&
          filteredDefaultMCPServerViews.length === 0 &&
          filteredNonDefaultMCPServerViews.length === 0 && (
            <DropdownMenuLabel label="No tools found" />
          )}

        {searchText.length === 0 && <DropdownMenuLabel label="Top tools" />}
        {filteredDefaultTools.map((tool) => {
          return (
            <DropdownMenuItem
              truncateText
              key={tool.label}
              icon={<Avatar icon={tool.dropDownIcon} size="sm" />}
              label={tool.label}
              description={tool.description}
              onClick={() => {
                if (tool.type === "DATA_VISUALIZATION") {
                  onClickDataVisualization();
                } else {
                  onClickDefaultTool(tool.type);
                }
              }}
            />
          );
        })}

        {filteredDefaultMCPServerViews.map((view) => {
          return (
            <DropdownMenuItem
              truncateText
              key={view.id}
              icon={() => getAvatar(view.server)}
              label={view.label}
              description={view.server.description}
              onClick={() => onClickMCPServer(view)}
            />
          );
        })}

        {filteredNonDefaultMCPServerViews.length > 0 && (
          <>
            {searchText.length === 0 && (
              <DropdownMenuLabel label="Other tools" />
            )}
            {filteredNonDefaultMCPServerViews.map((view) => {
              return (
                <DropdownMenuItem
                  truncateText
                  key={view.id}
                  icon={getAvatar(view.server)}
                  label={asDisplayName(view.server.name)}
                  description={view.server.description}
                  onClick={() => onClickMCPServer(view)}
                />
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
