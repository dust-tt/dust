import type { MultiPageDialogPage } from "@dust-tt/sparkle";
import {
  Button,
  ListAddIcon,
  MultiPageDialog,
  MultiPageDialogContent,
  MultiPageDialogTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { UseFieldArrayAppend } from "react-hook-form";
import { useForm } from "react-hook-form";

import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerConfigurationType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { MCPActionHeader } from "@app/components/agent_builder/capabilities/mcp/MCPActionHeader";
import { MCPServerSelectionPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerSelectionPage";
import { generateUniqueActionName } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultFormValues } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { createFormResetHandler } from "@app/components/agent_builder/capabilities/mcp/utils/formStateUtils";
import {
  getMCPConfigurationFormSchema,
  validateMCPActionConfiguration,
} from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import { ChildAgentSection } from "@app/components/agent_builder/capabilities/shared/ChildAgentSection";
import { DustAppSection } from "@app/components/agent_builder/capabilities/shared/DustAppSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { ReasoningModelSection } from "@app/components/agent_builder/capabilities/shared/ReasoningModelSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  ActionSpecification,
  AgentBuilderAction,
  ConfigurationPagePageId,
} from "@app/components/agent_builder/types";
import {
  CONFIGURATION_DIALOG_PAGE_IDS,
  getDefaultMCPAction,
} from "@app/components/agent_builder/types";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
} from "@app/lib/actions/constants";
import { getAvatarFromIcon } from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useModels } from "@app/lib/swr/models";
import { useSpaces } from "@app/lib/swr/spaces";
import { O4_MINI_MODEL_ID } from "@app/types";

export type SelectedTool =
  | {
      type: "MCP";
      view: MCPServerViewType;
      configuredAction?: AgentBuilderAction;
    }
  | { type: "DATA_VISUALIZATION" };

const DEFAULT_REASONING_MODEL_ID = O4_MINI_MODEL_ID;

export type DialogMode =
  | { type: "add" }
  | { type: "edit"; action: AgentBuilderAction; index: number }
  | { type: "info"; action: AgentBuilderAction };

type MCPActionWithConfiguration = AgentBuilderAction & {
  type: "MCP";
  configuration: MCPServerConfigurationType;
};

function isMCPActionWithConfiguration(
  action: AgentBuilderAction
): action is MCPActionWithConfiguration {
  return (
    action.type === "MCP" &&
    action.configuration !== null &&
    action.configuration !== undefined &&
    typeof action.configuration === "object" &&
    "mcpServerViewId" in action.configuration
  );
}

interface MCPServerViewsDialogProps {
  addTools: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  dataVisualization: ActionSpecification | null;
  mode: DialogMode | null;
  onModeChange: (mode: DialogMode | null) => void;
  onActionUpdate?: (action: AgentBuilderAction, index: number) => void;
  actions: AgentBuilderAction[];
  getAgentInstructions: () => string;
}

export function MCPServerViewsDialog({
  addTools,
  dataVisualization,
  mode,
  onModeChange,
  onActionUpdate,
  actions,
  getAgentInstructions,
}: MCPServerViewsDialogProps) {
  const { owner } = useAgentBuilderContext();
  const { spaces } = useSpaces({ workspaceId: owner.sId });
  const sendNotification = useSendNotification();
  const { reasoningModels } = useModels({ owner });
  const {
    mcpServerViews: allMcpServerViews,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const isEditMode = !!mode && mode.type === "edit";
  const isInfoMode = !!mode && mode.type === "info";
  const isAddMode = !mode || mode.type === "add";

  const [selectedToolsInDialog, setSelectedToolsInDialog] = useState<
    SelectedTool[]
  >([]);

  const [isOpen, setIsOpen] = useState(!!mode);
  const [currentPageId, setCurrentPageId] = useState<ConfigurationPagePageId>(
    isEditMode
      ? CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION
      : isInfoMode
        ? CONFIGURATION_DIALOG_PAGE_IDS.INFO
        : CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION
  );
  const [configurationTool, setConfigurationTool] =
    useState<AgentBuilderAction | null>(isEditMode ? mode.action : null);

  const [configurationMCPServerView, setConfigurationMCPServerView] =
    useState<MCPServerViewType | null>(null);
  const [infoMCPServerView, setInfoMCPServerView] =
    useState<MCPServerViewType | null>(null);

  const hasReasoningModel = reasoningModels.length > 0;

  // You cannot select the same tool twice unless it's configurable.
  const selectableDefaultMCPServerViews = useMemo(() => {
    const filteredList = defaultMCPServerViews.filter((view) => {
      const selectedAction = actions.find(
        (action) => action.name === view.server.name
      );

      if (selectedAction) {
        return !selectedAction.noConfigurationRequired;
      }

      return true;
    });

    if (hasReasoningModel) {
      return filteredList;
    }

    // You should not be able to select Reasoning if there is no reasoning model available.
    return filteredList.filter(
      (view) => !getMCPServerRequirements(view).requiresReasoningConfiguration
    );
  }, [defaultMCPServerViews, actions, hasReasoningModel]);

  const selectableNonDefaultMCPServerViews = useMemo(
    () =>
      nonDefaultMCPServerViews.filter((view) => {
        const selectedAction = actions.find(
          (action) => action.name === view.server.name
        );

        if (selectedAction) {
          return !selectedAction.noConfigurationRequired;
        }

        return true;
      }),
    [nonDefaultMCPServerViews, actions]
  );

  useEffect(() => {
    if (isEditMode) {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION);
      setConfigurationTool(mode.action);
      setSelectedToolsInDialog([]);

      const action = mode.action;
      if (
        isMCPActionWithConfiguration(action) &&
        allMcpServerViews.length > 0
      ) {
        const mcpServerView = allMcpServerViews.find(
          (view) => view.sId === action.configuration.mcpServerViewId
        );
        if (mcpServerView) {
          setConfigurationMCPServerView(mcpServerView);
        }
      }
    } else if (isInfoMode) {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.INFO);
      setSelectedToolsInDialog([]);

      const action = mode.action;
      if (
        isMCPActionWithConfiguration(action) &&
        allMcpServerViews.length > 0
      ) {
        const mcpServerView = allMcpServerViews.find(
          (view) => view.sId === action.configuration.mcpServerViewId
        );
        if (mcpServerView) {
          setInfoMCPServerView(mcpServerView);
        }
      }
    } else if (isAddMode) {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
      setConfigurationTool(null);
      setConfigurationMCPServerView(null);
      setInfoMCPServerView(null);
    }
    setIsOpen(!!mode);
  }, [mode, allMcpServerViews, isEditMode]);

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
    const tool = { type: "MCP", view: mcpServerView } satisfies SelectedTool;
    const requirement = getMCPServerRequirements(mcpServerView);

    if (!requirement.noRequirement) {
      const action = getDefaultMCPAction(mcpServerView);
      const isReasoning = requirement.requiresReasoningConfiguration;

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

        setConfigurationTool({
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
      } else {
        setConfigurationTool(action);
      }

      setConfigurationMCPServerView(mcpServerView);
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION);
      return;
    }

    // No configuration required, add to selected tools
    toggleToolSelection(tool);
  }

  const handleAddSelectedTools = useCallback(() => {
    // Validate any configured tools before adding
    for (const tool of selectedToolsInDialog) {
      if (tool.type === "MCP" && tool.configuredAction) {
        const validation = validateMCPActionConfiguration(
          tool.configuredAction,
          tool.view
        );

        if (!validation.isValid) {
          sendNotification({
            title: "Configuration validation failed",
            description: validation.errorMessage!,
            type: "error",
          });
          return;
        }
      }
    }

    // All validations passed, add the tools
    addTools(
      selectedToolsInDialog.map((tool) => {
        if (tool.type === "DATA_VISUALIZATION") {
          return {
            id: uniqueId(),
            type: "DATA_VISUALIZATION",
            configuration: null,
            name: DEFAULT_DATA_VISUALIZATION_NAME,
            description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
            noConfigurationRequired: true,
          };
        } else {
          return tool.configuredAction || getDefaultMCPAction(tool.view);
        }
      })
    );

    setSelectedToolsInDialog([]);
  }, [selectedToolsInDialog, addTools, sendNotification]);

  const mcpServerView = configurationMCPServerView;

  const formSchema = useMemo(
    () => (mcpServerView ? getMCPConfigurationFormSchema(mcpServerView) : null),
    [mcpServerView]
  );

  // Memoize default values to prevent form recreation
  const defaultFormValues = useMemo<MCPFormData>(() => {
    if (configurationTool?.type === "MCP") {
      return {
        name: configurationTool.name ?? "",
        description: configurationTool.description ?? "",
        configuration: configurationTool.configuration,
      };
    }

    return getDefaultFormValues(mcpServerView);
  }, [configurationTool, mcpServerView]);

  // Create stable form instance with conditional resolver
  const form = useForm<MCPFormData>({
    resolver: formSchema ? zodResolver(formSchema) : undefined,
    mode: "onChange",
    defaultValues: defaultFormValues,
    // Prevent form recreation by providing stable shouldUnregister
    shouldUnregister: false,
  });

  const requirements = useMemo(
    () => (mcpServerView ? getMCPServerRequirements(mcpServerView) : null),
    [mcpServerView]
  );

  // Stable form reset handler - no form dependency to prevent re-renders
  const resetFormValues = useMemo(
    () => createFormResetHandler(configurationTool, mcpServerView, isOpen),
    [configurationTool, mcpServerView, isOpen]
  );

  useEffect(() => {
    resetFormValues(form);
  }, [resetFormValues, form]);

  const handleBackToSelection = () => {
    setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
    setConfigurationTool(null);
    setConfigurationMCPServerView(null);
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
            ...selectableDefaultMCPServerViews,
            ...selectableNonDefaultMCPServerViews,
          ]}
          onItemClick={onClickMCPServer}
          dataVisualization={dataVisualization}
          onDataVisualizationClick={onClickDataVisualization}
          selectedToolsInDialog={selectedToolsInDialog}
          onRemoveSelectedTool={toggleToolSelection}
        />
      ),
    },
    {
      id: CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION,
      title: mcpServerView?.name || "Configure Tool",
      description: "",
      icon: undefined,
      content:
        configurationTool && mcpServerView && requirements && formSchema ? (
          <FormProvider form={form}>
            <div>
              <div className="space-y-6">
                <MCPActionHeader
                  action={configurationTool}
                  mcpServerView={mcpServerView}
                  allowNameEdit={!configurationTool.noConfigurationRequired}
                />

                {requirements.requiresReasoningConfiguration && (
                  <ReasoningModelSection />
                )}

                {requirements.requiresChildAgentConfiguration && (
                  <ChildAgentSection />
                )}

                {requirements.mayRequireTimeFrameConfiguration && (
                  <TimeFrameSection actionType="search" />
                )}

                {requirements.requiresDustAppConfiguration && (
                  <DustAppSection allowedSpaces={spaces} />
                )}

                {requirements.mayRequireJsonSchemaConfiguration && (
                  <JsonSchemaSection
                    getAgentInstructions={getAgentInstructions}
                  />
                )}
              </div>
            </div>
          </FormProvider>
        ) : (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ),
    },
    {
      id: CONFIGURATION_DIALOG_PAGE_IDS.INFO,
      title: infoMCPServerView?.name || "Tool Information",
      description: "",
      icon: undefined,
      content: infoMCPServerView ? (
        <div className="flex h-full flex-col space-y-2">
          <div className="flex items-center space-x-2 text-base font-medium">
            {getAvatarFromIcon(infoMCPServerView.server.icon, "sm")}
            <span className="">{infoMCPServerView.server.name}</span>
          </div>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {infoMCPServerView.server.description}
          </span>
          <ToolsList
            owner={owner}
            mcpServerView={infoMCPServerView}
            disableUpdates
          />
        </div>
      ) : (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ),
    },
  ];

  const handleCancel = () => {
    setIsOpen(false);
    onModeChange(null);
    if (isAddMode) {
      setSelectedToolsInDialog([]);
      setConfigurationTool(null);
      setConfigurationMCPServerView(null);
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
    }
  };

  const handleConfigurationSave = async (formData: MCPFormData) => {
    if (!configurationTool || !form || !mcpServerView) {
      return;
    }

    try {
      // Ensure we're working with an MCP action
      if (configurationTool.type !== "MCP") {
        throw new Error("Expected MCP action for configuration save");
      }

      // TODO: it should not be null but sometimes mode is not set properly when you add a new action.
      const isNewActionOrNameChanged =
        mode === null ||
        mode?.type === "add" ||
        (mode?.type === "edit" && defaultFormValues.name !== formData.name);

      const newActionName = isNewActionOrNameChanged
        ? generateUniqueActionName({
            baseName: formData.name,
            existingActions: actions,
            selectedToolsInDialog,
          })
        : formData.name;

      const configuredAction: AgentBuilderAction = {
        ...configurationTool,
        name: newActionName,
        description: formData.description,
        configuration: formData.configuration,
      };

      if (mode?.type === "edit" && onActionUpdate) {
        // Edit mode: save the updated action and close dialog
        onActionUpdate(configuredAction, mode.index);
        setIsOpen(false);
        onModeChange(null);

        sendNotification({
          title: "Tool updated successfully",
          description: `${mcpServerView.server.name} configuration has been updated.`,
          type: "success",
        });
      } else {
        // You can add one tool multiple times if it's configurable, but you cannot have the same name,
        // so we should check its name and not its id
        setSelectedToolsInDialog((prev) => {
          const existingToolIndex = prev.findIndex(
            (tool) =>
              tool.type === "MCP" &&
              tool.configuredAction?.name === newActionName
          );

          if (existingToolIndex >= 0) {
            // Update existing tool with configuration
            const updated = [...prev];
            updated[existingToolIndex] = {
              type: "MCP",
              view: mcpServerView,
              configuredAction,
            };
            return updated;
          } else {
            // Add new configured tool
            return [
              ...prev,
              {
                type: "MCP",
                view: mcpServerView,
                configuredAction,
              },
            ];
          }
        });

        // Navigate back to tool selection page
        setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
        setConfigurationTool(null);
        setConfigurationMCPServerView(null);
      }
    } catch (error) {
      sendNotification({
        title: "Configuration failed",
        description:
          "There was an error configuring the tool. Please try again.",
        type: "error",
      });
    }
  };

  const getFooterButtons = () => {
    const isToolSelectionPage =
      currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION;
    const isConfigurationPage =
      currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION;
    const isInfoPage = currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.INFO;

    if (isToolSelectionPage) {
      return {
        leftButton: {
          label: "Cancel",
          variant: "outline" as const,
          onClick: handleCancel,
        },
        rightButton: {
          label:
            selectedToolsInDialog.length > 0
              ? `Add ${selectedToolsInDialog.length} tool${selectedToolsInDialog.length > 1 ? "s" : ""}`
              : "Add tools",
          variant: "primary",
          disabled: selectedToolsInDialog.length === 0,
          onClick: () => {
            handleAddSelectedTools();
            setIsOpen(false);
            onModeChange(null);
          },
        },
      };
    }

    if (isConfigurationPage) {
      if (isEditMode) {
        // Edit mode: only Cancel and Save buttons
        return {
          leftButton: {
            label: "Cancel",
            variant: "outline",
            onClick: handleCancel,
          },
          rightButton: {
            label: "Save Changes",
            variant: "primary",
            onClick: form.handleSubmit(handleConfigurationSave),
          },
        };
      } else {
        return {
          leftButton: {
            label: "Back",
            variant: "outline",
            onClick: handleBackToSelection,
          },
          rightButton: {
            label: "Save Configuration",
            variant: "primary",
            onClick: form.handleSubmit(handleConfigurationSave),
          },
        };
      }
    }

    if (isInfoPage) {
      return {
        rightButton: {
          label: "Close",
          variant: "primary",
          onClick: handleCancel,
        },
      };
    }

    return {};
  };

  const { leftButton, rightButton } = getFooterButtons();

  return (
    <MultiPageDialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onModeChange(open ? mode : null);

        if (open && isAddMode) {
          setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
        }

        if (!open && !isAddMode) {
          setConfigurationTool(null);
          setConfigurationMCPServerView(null);
          setSelectedToolsInDialog([]);
        }
      }}
    >
      <MultiPageDialogTrigger asChild>
        <Button
          onClick={() => onModeChange({ type: "add" })}
          label="Add tools"
          icon={ListAddIcon}
        />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        showNavigation={false}
        isAlertDialog
        size="xl"
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={(pageId) => {
          if (pageId === CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION) {
            handleBackToSelection();
          } else {
            setCurrentPageId(pageId as ConfigurationPagePageId);
          }
        }}
        leftButton={leftButton}
        rightButton={rightButton}
      />
    </MultiPageDialog>
  );
}
