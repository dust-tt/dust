import type { MultiPageDialogPage } from "@dust-tt/sparkle";
import {
  Button,
  LightbulbIcon,
  MultiPageDialog,
  MultiPageDialogContent,
  MultiPageDialogTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { uniqueId } from "lodash";
import { useMemo, useState } from "react";
import React from "react";
import type { UseFieldArrayAppend } from "react-hook-form";
import { useForm } from "react-hook-form";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderAction,
  AgentBuilderFormData,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMCPConfigurationFormSchema } from "@app/components/agent_builder/capabilities/mcp/formValidation";
import { MCPActionHeader } from "@app/components/agent_builder/capabilities/mcp/MCPActionHeader";
import { MCPServerSelectionPage } from "@app/components/agent_builder/capabilities/MCPServerSelectionPage";
import { ChildAgentSection } from "@app/components/agent_builder/capabilities/shared/ChildAgentSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { ReasoningModelSection } from "@app/components/agent_builder/capabilities/shared/ReasoningModelSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  ActionSpecification,
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
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useModels } from "@app/lib/swr/models";
import { O4_MINI_MODEL_ID } from "@app/types";
import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { getAvatarFromIcon } from "@app/lib/actions/mcp_icons";

export type SelectedTool =
  | {
      type: "MCP";
      view: MCPServerViewType;
      configuredAction?: AgentBuilderAction;
    }
  | { type: "DATA_VISUALIZATION" };

const DEFAULT_REASONING_MODEL_ID = O4_MINI_MODEL_ID;

interface MCPServerViewsDialogProps {
  addTools: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  mcpServerViews: MCPServerViewTypeWithLabel[];
  isMCPServerViewsLoading: boolean;
  dataVisualization: ActionSpecification | null;
  // Edit mode props
  editAction?: AgentBuilderAction | null;
  editActionIndex?: number;
  onEditActionSave?: (action: AgentBuilderAction, index: number) => void;
  onEditActionCancel?: () => void;
  // Info mode props
  infoAction?: AgentBuilderAction | null;
  onInfoActionClose?: () => void;
}

export function MCPServerViewsDialog({
  addTools,
  mcpServerViews,
  isMCPServerViewsLoading,
  dataVisualization,
  editAction,
  editActionIndex,
  onEditActionSave,
  onEditActionCancel,
  infoAction,
  onInfoActionClose,
}: MCPServerViewsDialogProps) {
  const { owner } = useAgentBuilderContext();
  const sendNotification = useSendNotification();
  const { reasoningModels } = useModels({ owner });
  const { mcpServerViews: allMcpServerViews } = useMCPServerViewsContext();

  const isEditMode = Boolean(
    editAction && typeof editActionIndex === "number" && onEditActionSave
  );
  const isInfoMode = Boolean(infoAction && onInfoActionClose);

  const [selectedToolsInDialog, setSelectedToolsInDialog] = useState<
    SelectedTool[]
  >([]);
  const [isOpen, setIsOpen] = useState(isEditMode || isInfoMode);
  const [currentPageId, setCurrentPageId] = useState<ConfigurationPagePageId>(
    isEditMode
      ? CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION
      : isInfoMode
        ? CONFIGURATION_DIALOG_PAGE_IDS.INFO
        : CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION
  );
  const [configurationTool, setConfigurationTool] =
    useState<AgentBuilderAction | null>(editAction || null);

  const [configurationMCPServerView, setConfigurationMCPServerView] =
    useState<MCPServerViewType | null>(null);
  const [infoMCPServerView, setInfoMCPServerView] =
    useState<MCPServerViewType | null>(null);

  React.useEffect(() => {
    if (isEditMode && editAction) {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION);
      setConfigurationTool(editAction);
      setSelectedToolsInDialog([]);
      setIsOpen(true);

      // Set MCP server view for edit mode
      if (editAction.type === "MCP" && mcpServerViews.length > 0) {
        const mcpServerView = mcpServerViews.find(
          (view) => view.sId === editAction.configuration.mcpServerViewId
        );
        if (mcpServerView) {
          setConfigurationMCPServerView(mcpServerView);
        }
      }
    } else if (isInfoMode && infoAction) {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.INFO);
      setSelectedToolsInDialog([]);
      setIsOpen(true);

      // Set MCP server view for info mode
      if (infoAction.type === "MCP" && allMcpServerViews.length > 0) {
        const mcpServerView = allMcpServerViews.find(
          (view) => view.sId === infoAction.configuration.mcpServerViewId
        );
        if (mcpServerView) {
          setInfoMCPServerView(mcpServerView);
        }
      }
    } else if (!isEditMode && !isInfoMode) {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
      setConfigurationTool(null);
      setConfigurationMCPServerView(null);
      setInfoMCPServerView(null);
    }
  }, [
    isEditMode,
    isInfoMode,
    editAction,
    infoAction,
    mcpServerViews,
    allMcpServerViews,
  ]);

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

    // If configuration is required, navigate to configuration page
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
        // Use the configured action if available, otherwise use default
        const action = tool.configuredAction || getDefaultMCPAction(tool.view);
        addTools(action);
      }
    });

    // Clear selected tools after adding
    setSelectedToolsInDialog([]);
  };

  // Configuration form logic
  const mcpServerView = configurationMCPServerView;

  const formSchema = useMemo(
    () => (mcpServerView ? getMCPConfigurationFormSchema(mcpServerView) : null),
    [mcpServerView]
  );

  const form = useForm<MCPFormData>({
    ...(formSchema && { resolver: zodResolver(formSchema) }),
    defaultValues:
      configurationTool?.type === "MCP"
        ? {
            name: configurationTool.name ?? "",
            description: configurationTool.description ?? "",
            configuration: configurationTool.configuration,
          }
        : {
            name: "",
            description: "",
            configuration: {
              mcpServerViewId: mcpServerView?.sId ?? "",
              dataSourceConfigurations: null,
              tablesConfigurations: null,
              childAgentId: null,
              reasoningModel: null,
              timeFrame: null,
              additionalConfiguration: {},
              dustAppConfiguration: null,
              jsonSchema: null,
              _jsonSchemaString: null,
            },
          },
  });

  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  // Reset form when configurationTool changes
  React.useEffect(() => {
    if (configurationTool?.type === "MCP" && mcpServerView) {
      const formValues = {
        name: configurationTool.name ?? "",
        description: configurationTool.description ?? "",
        configuration: configurationTool.configuration,
      };
      form.reset(formValues);
    }
  }, [configurationTool, mcpServerView, form]);

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
          mcpServerViews={mcpServerViews}
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
                  <ReasoningModelSection owner={owner} />
                )}

                {requirements.requiresChildAgentConfiguration && (
                  <ChildAgentSection owner={owner} />
                )}

                {requirements.mayRequireTimeFrameConfiguration && (
                  <TimeFrameSection actionType="search" />
                )}

                {requirements.mayRequireJsonSchemaConfiguration && (
                  <JsonSchemaSection
                    owner={owner}
                    fieldName="configuration.jsonSchema"
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
            forcedCanUpdate={false}
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
    if (isEditMode && onEditActionCancel) {
      onEditActionCancel();
    } else if (isInfoMode && onInfoActionClose) {
      onInfoActionClose();
    } else if (!isEditMode && !isInfoMode) {
      setSelectedToolsInDialog([]);
      setConfigurationTool(null);
      setConfigurationMCPServerView(null);
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
    }
  };

  const handleConfigurationSave = async () => {
    if (!configurationTool || !form || !mcpServerView) {
      return;
    }

    try {
      const isValid = await form.trigger();
      if (!isValid) {
        const errors = form.formState.errors;
        console.log("Form errors:", errors);
        sendNotification({
          title: "Form validation failed",
          description: "Please check the form for errors and try again.",
          type: "error",
        });
        return;
      }

      const formData = form.getValues();
      const configuredAction: AgentBuilderAction = {
        ...configurationTool,
        name: formData.name,
        description: formData.description,
        configuration: formData.configuration as any,
      };

      if (
        isEditMode &&
        onEditActionSave &&
        typeof editActionIndex === "number"
      ) {
        // Edit mode: save the updated action and close dialog
        onEditActionSave(configuredAction, editActionIndex);
        setIsOpen(false);

        sendNotification({
          title: "Tool updated successfully",
          description: `${mcpServerView.name} configuration has been updated.`,
          type: "success",
        });
      } else {
        // Add mode: update the selected tool with the configured action
        setSelectedToolsInDialog((prev) => {
          const existingToolIndex = prev.findIndex(
            (tool) => tool.type === "MCP" && tool.view.sId === mcpServerView.sId
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

        sendNotification({
          title: "Tool configured successfully",
          description: `${mcpServerView.name} has been configured and added to your selection.`,
          type: "success",
        });
      }
    } catch (error) {
      console.error("Error in handleConfigurationSave:", error);
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
          variant: "primary" as const,
          disabled: selectedToolsInDialog.length === 0,
          onClick: () => {
            handleAddSelectedTools();
            setIsOpen(false);
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
            variant: "outline" as const,
            onClick: handleCancel,
          },
          rightButton: {
            label: "Save Changes",
            variant: "primary" as const,
            onClick: handleConfigurationSave,
          },
        };
      } else {
        // Add mode: Back, Cancel, and Save Configuration buttons
        return {
          leftButton: {
            label: "Back",
            variant: "outline" as const,
            onClick: handleBackToSelection,
          },
          centerButton: {
            label: "Cancel",
            variant: "outline" as const,
            onClick: handleCancel,
          },
          rightButton: {
            label: "Save Configuration",
            variant: "primary" as const,
            onClick: handleConfigurationSave,
          },
        };
      }
    }

    if (isInfoPage) {
      // Info mode: only Close button
      return {
        rightButton: {
          label: "Close",
          variant: "primary" as const,
          onClick: handleCancel,
        },
      };
    }

    return {};
  };

  const { leftButton, centerButton, rightButton } = getFooterButtons();

  return (
    <MultiPageDialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open && !isEditMode && !isInfoMode) {
          // Reset state when dialog closes (only in add mode)
          setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
          setConfigurationTool(null);
          setConfigurationMCPServerView(null);
          setSelectedToolsInDialog([]);
        }
      }}
    >
      <MultiPageDialogTrigger asChild>
        <Button label="Add tools" icon={LightbulbIcon} />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        showNavigation={
          !isEditMode &&
          !isInfoMode &&
          currentPageId === CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION
        }
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
        centerButton={centerButton}
        rightButton={rightButton}
      />
    </MultiPageDialog>
  );
}
