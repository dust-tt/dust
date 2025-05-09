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
import { groupBy, uniqueId } from "lodash";
import { useMemo, useState } from "react";

import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionState,
  AssistantBuilderActionType,
  AssistantBuilderDataVisualizationConfiguration,
  AssistantBuilderSetActionType,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";
import {
  getDataVisualizationAction,
  getDefaultActionConfiguration,
  getDefaultMCPServerActionConfiguration,
} from "@app/components/assistant_builder/types";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ActionSpecification } from "@app/lib/actions/utils";
import {
  ACTION_SPECIFICATIONS,
  DATA_VISUALIZATION_SPECIFICATION,
} from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { WhitelistableFeature } from "@app/types";
import { asDisplayName } from "@app/types";

type ActionSpecificationWithType = ActionSpecification & {
  type: AssistantBuilderActionType | "DATA_VISUALIZATION";
};

interface AddToolsDropdownProps {
  mcpServerViews: MCPServerViewType[];
  hasFeature: (feature: WhitelistableFeature | null | undefined) => boolean;
  enableReasoningTool: boolean;
  setEdited: (edited: boolean) => void;
  setAction: (action: AssistantBuilderSetActionType) => void;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  actions: AssistantBuilderActionState[];
}

const DEFAULT_TOOLS_WITH_CONFIGURATION = [
  "DUST_APP_RUN",
] as const satisfies Array<AssistantBuilderActionConfiguration["type"]>;

const DEFAULT_TOOLS_WITHOUT_CONFIGURATION = [
  "REASONING",
  "WEB_NAVIGATION",
  "DATA_VISUALIZATION",
] as const satisfies Array<
  | AssistantBuilderActionConfiguration["type"]
  | AssistantBuilderDataVisualizationConfiguration["type"]
>;

function getDefaultConfigurationSpecification(
  type: AssistantBuilderActionType | "DATA_VISUALIZATION"
): ActionSpecificationWithType {
  if (type === "DATA_VISUALIZATION") {
    return {
      type: "DATA_VISUALIZATION",
      ...DATA_VISUALIZATION_SPECIFICATION,
    };
  }

  return {
    type,
    ...ACTION_SPECIFICATIONS[type],
  };
}

function getSelectableDefaultTools({
  enableReasoningTool,
  actions,
  mcpServerViews,
}: {
  enableReasoningTool: boolean;
  actions: AssistantBuilderActionState[];
  mcpServerViews: MCPServerViewType[];
}) {
  // We should not show the option if it's already selected.
  const list = [
    ...DEFAULT_TOOLS_WITHOUT_CONFIGURATION,
    ...DEFAULT_TOOLS_WITH_CONFIGURATION,
  ].filter((tool) => {
    if (tool === "REASONING") {
      return (
        enableReasoningTool && !actions.some((action) => action.type === tool)
      );
    }
    // Users should see the old web Capabilities only if
    // their agents has it selected in the past or
    // if they don't have mcp_actions activated.
    if (tool === "WEB_NAVIGATION") {
      const webtoolsV2ServerName: InternalMCPServerNameType =
        "web_search_&_browse_v2";

      // This is to catch any changes in the name.
      const webtoolsServer = mcpServerViews.find(
        (view) => view.server.name === webtoolsV2ServerName
      );

      if (webtoolsServer != null) {
        return actions.some((action) => action.type === "WEB_NAVIGATION");
      }

      return true;
    }

    const isConfigurable = DEFAULT_TOOLS_WITH_CONFIGURATION.some(
      (defaultTool) => defaultTool === tool
    );

    if (isConfigurable) {
      return true;
    }

    return !actions.some((action) => action.type === tool);
  });

  return list.map((item) => getDefaultConfigurationSpecification(item));
}

function getSelectableMCPServerViews({
  actions,
  mcpServerViews,
}: {
  actions: AssistantBuilderActionState[];
  mcpServerViews: MCPServerViewType[];
}) {
  // We should remove from the list if it's already selected and non configurable.
  const filteredMCPServerViews = mcpServerViews.filter((view) => {
    const selectedAction = actions.find(
      (action) => action.name === view.server.name
    );

    if (selectedAction) {
      return !selectedAction.noConfigurationRequired;
    }

    return true;
  });

  const grouped = groupBy(filteredMCPServerViews, (view) =>
    view.server.isDefault ? "default" : "nonDefault"
  );

  return {
    selectableDefaultMCPServerViews: grouped.default || [],
    selectableNonDefaultMCPServerViews: grouped.nonDefault || [],
  };
}

export function AddToolsDropdown({
  mcpServerViews,
  setEdited,
  setAction,
  setBuilderState,
  actions,
  enableReasoningTool,
}: AddToolsDropdownProps) {
  // This is to filter out the non-enabled tools and non-configrable tools that are already selected.
  const selectableDefaultTools = useMemo(() => {
    return getSelectableDefaultTools({
      enableReasoningTool,
      actions: actions,
      mcpServerViews,
    });
  }, [enableReasoningTool, actions, mcpServerViews]);

  const {
    selectableDefaultMCPServerViews,
    selectableNonDefaultMCPServerViews,
  } = useMemo(
    () =>
      getSelectableMCPServerViews({
        actions,
        mcpServerViews,
      }),
    [mcpServerViews, actions]
  );

  const [searchText, setSearchText] = useState("");
  const [filteredDefaultTools, setFilteredDefaultTools] = useState<
    ActionSpecificationWithType[]
  >(selectableDefaultTools);
  const [filteredDefaultMCPServerViews, setFilteredDefaultMCPServerViews] =
    useState<MCPServerViewType[]>(selectableDefaultMCPServerViews);

  const [
    filteredNonDefaultMCPServerViews,
    setFilteredNonDefaultMCPServerViews,
  ] = useState<MCPServerViewType[]>(() => selectableNonDefaultMCPServerViews);

  function onOpenChange(open: boolean) {
    if (open) {
      setFilteredDefaultTools(selectableDefaultTools);
      setFilteredDefaultMCPServerViews(selectableDefaultMCPServerViews);
      setFilteredNonDefaultMCPServerViews(selectableNonDefaultMCPServerViews);
    } else {
      setSearchText("");
    }
  }

  function onSearchTextChange(text: string) {
    setSearchText(text);

    if (text.length === 0) {
      setFilteredDefaultTools(selectableDefaultTools);
      setFilteredDefaultMCPServerViews(selectableDefaultMCPServerViews);
      setFilteredNonDefaultMCPServerViews(selectableNonDefaultMCPServerViews);
    } else {
      setFilteredDefaultTools(() =>
        selectableDefaultTools.filter((tool) =>
          tool.label.toLowerCase().includes(text.toLowerCase())
        )
      );
      setFilteredDefaultMCPServerViews(() =>
        selectableDefaultMCPServerViews.filter((view) =>
          view.server.name.toLowerCase().includes(text.toLowerCase())
        )
      );
      setFilteredNonDefaultMCPServerViews(() =>
        selectableNonDefaultMCPServerViews.filter((view) =>
          view.server.name.toLowerCase().includes(text.toLowerCase())
        )
      );
    }
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

    // Remove it from the list of default tools.
    setFilteredDefaultTools(
      selectableDefaultTools.filter(
        (tool) => tool.type !== "DATA_VISUALIZATION"
      )
    );

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

    // If non configurable, remove it from the list of tools.
    if (action.noConfigurationRequired) {
      if (selectedView.server.isDefault) {
        setFilteredDefaultMCPServerViews(
          filteredDefaultMCPServerViews.filter(
            (view) => view.id !== selectedView.id
          )
        );
      } else {
        setFilteredNonDefaultMCPServerViews(
          filteredNonDefaultMCPServerViews.filter(
            (view) => view.id !== selectedView.id
          )
        );
      }
    }

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
              onChange={onSearchTextChange}
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
              label={asDisplayName(view.server.name)}
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
