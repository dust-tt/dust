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
import { isValidPage } from "@app/components/agent_builder/capabilities/knowledge/shared/sheetUtils";
import { MCPServerSelectionPage } from "@app/components/agent_builder/capabilities/MCPServerSelectionPage";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import type { ConfigurationPagePageId } from "@app/components/agent_builder/types";
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

  const [currentPageId, setCurrentPageId] = useState<ConfigurationPagePageId>(
    CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION
  );

  const { spaces } = useSpacesContext();

  // Data Visualization is not an action but we show like an action in UI.
  const onClickDataVisualization = () => {
    if (!dataVisualization) {
      return;
    }

    addTools({
      id: uniqueId(),
      type: "DATA_VISUALIZATION",
      configuration: null,
      name: DEFAULT_DATA_VISUALIZATION_NAME,
      description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
      noConfigurationRequired: true,
    });
  };

  function onClickMCPServer(mcpServerView: MCPServerViewType) {
    const requirement = getMCPServerRequirements(mcpServerView);
    const action = getDefaultMCPAction(mcpServerView);

    const isReasoning = requirement.requiresReasoningConfiguration;

    // We pre-select the default reasoning model.
    if (action.type === "MCP" && isReasoning) {
      // You should not be able to select reasoning option if you don't have any reasoning models,
      // but in case you do for some reasons, we show an error notification.
      if (reasoningModels.length === 0) {
        sendNotification({
          title: "No reasoning model available",
          description:
            "Please add a reasoning model to your workspace to be able to use this tool",
          type: "error",
        });
        return;
      }

      // Use o4-mini as default reasoning model, if it's not available use the first one in the list.
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

    // If no configuration is required, add it immediately to the agent builder main form.
    // If configuration is required, we will open a configuration panel and open a sub-form.
    if (requirement.noRequirement) {
      addTools(action);
    } else {
      setSelectedAction(action);
    }
  }

  const handlePageChange = (pageId: string) => {
    if (isValidPage(pageId, CONFIGURATION_DIALOG_PAGE_IDS)) {
      setCurrentPageId(pageId);
    }
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
        <MCPServerSelectionPage
          mcpServerViews={[
            ...defaultMCPServerViews,
            ...nonDefaultMCPServerViews,
          ]}
          onItemClick={onClickMCPServer}
          selectedServers={[]}
          dataVisualization={dataVisualization}
          onDataVisualizationClick={onClickDataVisualization}
        />
      ),
    },
  ];

  return (
    <MultiPageDialog>
      <MultiPageDialogTrigger asChild>
        <Button label="Add tools" icon={LightbulbIcon} />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        showNavigation={false}
        size="xl"
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={handlePageChange}
      />
    </MultiPageDialog>
  );
}
