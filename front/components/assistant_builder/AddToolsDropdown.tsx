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

import { useAssistantBuilderContext } from "@app/components/assistant_builder/contexts/AssistantBuilderContexts";
import type {
  ActionSpecificationWithType,
  AssistantBuilderDataVisualizationType,
  AssistantBuilderMCPServerType,
} from "@app/components/assistant_builder/types";
import {
  getDataVisualizationActionConfiguration,
  getDefaultMCPServerActionConfiguration,
  getDefaultMCPServerConfigurationWithId,
} from "@app/components/assistant_builder/types";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { ModelConfigurationType, SpaceType } from "@app/types";
import { O4_MINI_MODEL_ID } from "@app/types";

type MCPServerViewTypeWithLabel = MCPServerViewType & { label: string };

interface AddToolsDropdownProps {
  nonDefaultMCPActions: ActionSpecificationWithType[];
  defaultMCPServerViews: MCPServerViewTypeWithLabel[];
  nonDefaultMCPServerViews: MCPServerViewTypeWithLabel[];
  reasoningModels: ModelConfigurationType[];
  isLoading: boolean;
}

const DEFAULT_REASONING_MODEL_ID = O4_MINI_MODEL_ID;

export function AddToolsDropdown({
  nonDefaultMCPActions,
  defaultMCPServerViews,
  nonDefaultMCPServerViews,
  reasoningModels,
  isLoading,
}: AddToolsDropdownProps) {
  const { setAction, setEdited, setBuilderState, getAllowedSpaces } =
    useAssistantBuilderContext();

  const [searchText, setSearchText] = useState("");
  const [filteredNonMCPActions, setFilteredNonMCPActions] =
    useState(nonDefaultMCPActions);
  const [filteredMCPServerViews, setFilteredMCPServerViews] = useState([
    ...defaultMCPServerViews,
    ...nonDefaultMCPServerViews,
  ]);

  // Only allow one space across all actions.
  const allowedSpaces = getAllowedSpaces();

  const sendNotification = useSendNotification();

  const noFilteredTools =
    filteredNonMCPActions.length === 0 && filteredMCPServerViews.length === 0;

  function onOpenChange(open: boolean) {
    if (!open) {
      // Delay slightly to avoid flickering when the dropdown is closed.
      setTimeout(() => {
        setSearchText("");
        setFilteredNonMCPActions([]);
        setFilteredMCPServerViews([]);
      }, 200);
    }
  }

  function onChangeSearchText(text: string) {
    setSearchText(text);
    setFilteredNonMCPActions(
      nonDefaultMCPActions.filter(
        (tool) =>
          tool.label.toLowerCase().includes(text.toLowerCase()) ||
          tool.description.toLowerCase().includes(text.toLowerCase())
      )
    );
    setFilteredMCPServerViews(
      [...defaultMCPServerViews, ...nonDefaultMCPServerViews].filter(
        (view) =>
          view.label.toLowerCase().includes(text.toLowerCase()) ||
          view.description?.toLowerCase().includes(text.toLowerCase())
      )
    );
  }

  function onClickDefaultTool(
    actionType:
      | AssistantBuilderMCPServerType
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
        : getDefaultMCPServerConfigurationWithId();

    setAction({
      type: defaultAction.noConfigurationRequired ? "insert" : "pending",
      action: defaultAction,
    });
  }

  function onClickMCPServer(selectedView: MCPServerViewType) {
    setEdited(true);
    const action = getDefaultMCPServerActionConfiguration(selectedView);
    assert(action);

    const isReasoning =
      getMCPServerRequirements(selectedView).requiresReasoningConfiguration;

    // Reasoning is configurable but we select the reasoning model by default.
    if (action.type === "MCP" && isReasoning) {
      // You should not be able to select reasoning tools if you don't have any reasoning models,
      // but in case you do for some reasons, we show an error notification.
      if (reasoningModels.length === 0) {
        sendNotification({
          title: "No reasoning model available",
          description:
            "Please add a reasoning model to your workspace to be able to use this tool",
          type: "error",
        });
      } else {
        // Use o4-mini (high reasoning effort) as default reasoning model, if it's not available use the first one in the list.
        const defaultReasoningModel =
          reasoningModels.find(
            (model) => model.modelId === DEFAULT_REASONING_MODEL_ID
          ) ?? reasoningModels[0];

        setAction({
          type: "pending",
          action: {
            id: uniqueId(),
            ...action,
            configuration: {
              ...action.configuration,
              reasoningModel: {
                modelId: defaultReasoningModel.modelId,
                providerId: defaultReasoningModel.providerId,
                temperature: null,
                reasoningEffort: null,
              },
            },
          },
        });
      }

      return;
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
          <DropdownMenuSearchbar
            autoFocus
            name="search-tools"
            placeholder="Search Tools"
            value={searchText}
            onChange={onChangeSearchText}
          />
        }
      >
        {isLoading && (
          <div className="flex h-full w-full items-center justify-center rounded-xl">
            <Spinner />
          </div>
        )}
        {!isLoading &&
          searchText.length > 0 &&
          (noFilteredTools ? (
            <DropdownMenuLabel label="No tools found" />
          ) : (
            <>
              <DropdownMenuLabel label="Search results" />
              {filteredNonMCPActions.map((tool) => (
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
                  allowedSpaces={allowedSpaces}
                />
              ))}
            </>
          ))}

        {!isLoading && searchText.length === 0 && (
          <>
            <DropdownMenuLabel label="Top tools" />
            {nonDefaultMCPActions.map((tool) => (
              <DefaultToolDropdownMenuItem
                key={tool.label}
                tool={tool}
                onClick={() => onClickDefaultTool(tool.type)}
              />
            ))}
            {defaultMCPServerViews.map((view) => (
              <MCPDropdownMenuItem
                key={`${view.id}-${view.label}`} // There can be multiple views with the same id.
                view={view}
                onClick={onClickMCPServer}
                allowedSpaces={allowedSpaces}
              />
            ))}
            {nonDefaultMCPServerViews.length > 0 && (
              <>
                <DropdownMenuLabel label="Other tools" />
                {nonDefaultMCPServerViews.map((view) => (
                  <MCPDropdownMenuItem
                    key={`${view.id}-${view.label}`}
                    view={view}
                    onClick={onClickMCPServer}
                    allowedSpaces={allowedSpaces}
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
  allowedSpaces,
}: {
  view: MCPServerViewTypeWithLabel;
  onClick: (view: MCPServerViewType) => void;
  allowedSpaces: SpaceType[];
}) {
  const isDisabled =
    view.server.availability === "manual" &&
    !allowedSpaces.some((s) => s.sId === view.spaceId);

  return (
    <DropdownMenuItem
      truncateText
      icon={getAvatar(view.server)}
      label={getMcpServerViewDisplayName(view)}
      description={
        isDisabled
          ? `not in: ${allowedSpaces.map((s) => s.name).join(", ")}`
          : getMcpServerViewDescription(view)
      }
      onClick={() => onClick(view)}
      disabled={isDisabled}
    />
  );
}
