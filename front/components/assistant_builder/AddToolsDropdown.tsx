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
  AssistantBuilderDataVisualizationType,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  getDataVisualizationActionConfiguration,
  getDefaultActionConfiguration,
  getDefaultMCPServerActionConfiguration,
} from "@app/components/assistant_builder/types";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

type MCPServerViewTypeWithLabel = MCPServerViewType & { label: string };

interface AddToolsDropdownProps {
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  defaultTools: ActionSpecificationWithType[];
  defaultMCPServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMCPServerViews: MCPServerViewTypeWithLabel[];
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
  const [filteredMCPServerViews, setFilteredMCPServerViews] = useState([
    ...defaultMCPServerViews,
    ...nonDefaultMCPServerViews,
  ]);

  const noFilteredTools =
    filteredDefaultTools.length === 0 && filteredMCPServerViews.length === 0;

  function onOpenChange(open: boolean) {
    if (!open) {
      // Delay slightly to avoid flickering when the dropdown is closed.
      setTimeout(() => {
        setSearchText("");
        setFilteredDefaultTools([]);
        setFilteredMCPServerViews([]);
      }, 200);
    }
  }

  function onChangeSearchText(text: string) {
    setSearchText(text);
    setFilteredDefaultTools(
      defaultTools.filter((tool) =>
        tool.label.toLowerCase().includes(text.toLowerCase())
      )
    );
    setFilteredMCPServerViews(
      [...defaultMCPServerViews, ...nonDefaultMCPServerViews].filter((view) =>
        view.label.toLowerCase().includes(text.toLowerCase())
      )
    );
  }

  function onClickDefaultTool(
    actionType:
      | AssistantBuilderActionType
      | AssistantBuilderDataVisualizationType
  ) {
    setEdited(true);

    if (actionType === "DATA_VISUALIZATION") {
      // Data visualization is not an action, but we need to show it in the UI like an action.
      // So we need to set visualizationEnabled true and add it as an action.
      setBuilderState((state) => ({
        ...state,
        visualizationEnabled: true,
      }));
    }

    const defaultAction =
      actionType === "DATA_VISUALIZATION"
        ? getDataVisualizationActionConfiguration()
        : getDefaultActionConfiguration(actionType);
    assert(defaultAction);

    setAction({
      type: defaultAction.noConfigurationRequired ? "insert" : "pending",
      action: defaultAction,
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
          <DropdownMenuSearchbar
            autoFocus
            name="search-tools"
            placeholder="Search Tools"
            value={searchText}
            onChange={onChangeSearchText}
          />
        }
      >
        {searchText.length > 0 &&
          (noFilteredTools ? (
            <DropdownMenuLabel label="No tools found" />
          ) : (
            <>
              <DropdownMenuLabel label="Search results" />
              {filteredDefaultTools.map((tool) => (
                <DefaultToolDropdownMenuItem
                  key={tool.label}
                  tool={tool}
                  onClick={(tool) => onClickDefaultTool(tool.type)}
                />
              ))}
              {filteredMCPServerViews.map((view) => (
                <MCPDropdownMenuItem
                  key={view.id}
                  view={view}
                  onClick={onClickMCPServer}
                />
              ))}
            </>
          ))}

        {searchText.length === 0 && (
          <>
            <DropdownMenuLabel label="Top tools" />
            {defaultTools.map((tool) => (
              <DefaultToolDropdownMenuItem
                key={tool.label}
                tool={tool}
                onClick={() => onClickDefaultTool(tool.type)}
              />
            ))}
            {defaultMCPServerViews.map((view) => (
              <MCPDropdownMenuItem
                key={view.id}
                view={view}
                onClick={onClickMCPServer}
              />
            ))}
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

function DefaultToolDropdownMenuItem({
  tool,
  onClick,
}: {
  tool: ActionSpecificationWithType;
  onClick: (toolType: ActionSpecificationWithType) => void;
}) {
  return (
    <DropdownMenuItem
      truncateText
      icon={<Avatar icon={tool.dropDownIcon} size="sm" />}
      label={tool.label}
      description={tool.description}
      onClick={() => onClick(tool)}
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
      label={view.label}
      description={view.server.description}
      onClick={() => onClick(view)}
    />
  );
}
