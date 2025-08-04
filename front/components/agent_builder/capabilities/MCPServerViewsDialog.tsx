import type { MultiPageDialogPage } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { LightbulbIcon } from "@dust-tt/sparkle";
import { MultiPageDialog, MultiPageDialogTrigger } from "@dust-tt/sparkle";
import { MultiPageDialogContent } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import is from "@sindresorhus/is";
import { uniqueId } from "lodash";
import { useState } from "react";
import React from "react";
import type { FieldArrayWithId } from "react-hook-form";
import type { UseFieldArrayAppend } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { AgentBuilderAction } from "@app/components/agent_builder/AgentBuilderFormContext";
import { MCPServerSelectionPage } from "@app/components/agent_builder/capabilities/MCPServerSelectionPage";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { CONFIGURATION_DIALOG_PAGE_IDS } from "@app/components/agent_builder/types";
import { useSendNotification } from "@app/hooks/useNotification";
import { DEFAULT_DATA_VISUALIZATION_NAME } from "@app/lib/actions/constants";
import { DEFAULT_DATA_VISUALIZATION_DESCRIPTION } from "@app/lib/actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useModels } from "@app/lib/swr/models";
import { O4_MINI_MODEL_ID } from "@app/types";
import undefined = is.undefined;

export type SelectedTool =
  | { type: "MCP"; view: MCPServerViewType }
  | { type: "DATA_VISUALIZATION" };

const DEFAULT_REASONING_MODEL_ID = O4_MINI_MODEL_ID;

interface MCPServerViewsDialogProps {
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

export function MCPServerViewsDialog({
  tools,
  addTools,
  setSelectedAction,
  defaultMCPServerViews,
  nonDefaultMCPServerViews,
  isMCPServerViewsLoading,
  dataVisualization,
}: MCPServerViewsDialogProps) {
  const { owner } = useAgentBuilderContext();
  const sendNotification = useSendNotification();
  const { reasoningModels } = useModels({ owner });

  const [selectedToolsInDialog, setSelectedToolsInDialog] = useState<
    SelectedTool[]
  >([]);
  const [isOpen, setIsOpen] = useState(false);

  const toggleToolSelection = (tool: SelectedTool): void => {
    setSelectedToolsInDialog((prev) => {
      const isSelected = prev.some((selected) => {
        if (tool.type !== selected.type) {
          return false;
        }
        if (tool.type === "DATA_VISUALIZATION") {
          return true;
        }
        return (
          tool.type === "MCP" &&
          selected.type === "MCP" &&
          tool.view.sId === selected.view.sId
        );
      });

      if (isSelected) {
        return prev.filter((selected) => {
          if (tool.type !== selected.type) {
            return true;
          }
          if (tool.type === "DATA_VISUALIZATION") {
            return false;
          }
          return (
            tool.type === "MCP" &&
            selected.type === "MCP" &&
            tool.view.sId !== selected.view.sId
          );
        });
      } else {
        return [...prev, tool];
      }
    });
  };

  // Data Visualization is not an action but we show like an action in UI.
  const onClickDataVisualization = () => {
    if (!dataVisualization) {
      return;
    }
    toggleToolSelection({ type: "DATA_VISUALIZATION" });
  };

  function onClickMCPServer(mcpServerView: MCPServerViewType) {
    const tool: SelectedTool = { type: "MCP", view: mcpServerView };
    const requirement = getMCPServerRequirements(mcpServerView);

    // If configuration is required, open configuration sheet
    if (!requirement.noRequirement) {
      const action = getDefaultMCPAction(mcpServerView);
      const isReasoning = requirement.requiresReasoningConfiguration;

      // Handle reasoning configuration
      if (action.type === "MCP" && isReasoning) {
        if (reasoningModels.length === 0) {
          sendNotification({
            title: "No reasoning model available",
            description:
              "Please add a reasoning model to your workspace to be able to use this tool",
            type: "error",
          });
          return;
        }

        const defaultReasoningModel =
          reasoningModels.find(
            (model) => model.modelId === DEFAULT_REASONING_MODEL_ID
          ) ?? reasoningModels[0];

        setSelectedAction({
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
        });
        return;
      }

      setSelectedAction(action);
      return;
    }

    // No configuration required, add to selected tools
    toggleToolSelection(tool);
  }

  const handleAddSelectedTools = () => {
    selectedToolsInDialog.forEach((tool) => {
      if (tool.type === "DATA_VISUALIZATION") {
        addTools({
          id: uniqueId(),
          type: "DATA_VISUALIZATION",
          configuration: null,
          name: DEFAULT_DATA_VISUALIZATION_NAME,
          description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
          noConfigurationRequired: true,
        });
      } else if (tool.type === "MCP") {
        const action = getDefaultMCPAction(tool.view);
        addTools(action);
      }
    });

    // Clear selected tools after adding
    setSelectedToolsInDialog([]);
  };

  const pages: MultiPageDialogPage[] = [
    {
      id: CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION,
      title: "Add tools",
      description: "",
      icon: undefined,
      content: isMCPServerViewsLoading ? (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-y-auto">
            <MCPServerSelectionPage
              mcpServerViews={[
                ...defaultMCPServerViews,
                ...nonDefaultMCPServerViews,
              ]}
              onItemClick={onClickMCPServer}
              dataVisualization={dataVisualization}
              onDataVisualizationClick={onClickDataVisualization}
              selectedToolsInDialog={selectedToolsInDialog}
              onRemoveSelectedTool={toggleToolSelection}
            />
          </div>
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button
              variant="outline"
              label="Cancel"
              onClick={() => {
                setIsOpen(false);
                setSelectedToolsInDialog([]);
              }}
            />
            <Button
              label={
                selectedToolsInDialog.length > 0
                  ? `Add ${selectedToolsInDialog.length} tool${selectedToolsInDialog.length > 1 ? "s" : ""}`
                  : "Add tools"
              }
              disabled={selectedToolsInDialog.length === 0}
              onClick={() => {
                handleAddSelectedTools();
                setIsOpen(false);
              }}
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <MultiPageDialog open={isOpen} onOpenChange={setIsOpen}>
      <MultiPageDialogTrigger asChild>
        <Button label="Add tools" icon={LightbulbIcon} />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        showNavigation={false}
        size="xl"
        pages={pages}
        currentPageId={CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION}
        onPageChange={() => {}}
      />
    </MultiPageDialog>
  );
}
