import type { MultiPageDialogPage } from "@dust-tt/sparkle";
import {
  Chip,
  ContentMessage,
  MultiPageDialog,
  MultiPageDialogContent,
  SearchInput,
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
import { MCPServerViewsFooter } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsFooter";
import { generateUniqueActionName } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import {
  getFooterButtons,
  getInitialConfigurationTool,
  getInitialPageId,
  handleConfigurationSave as handleConfigurationSaveUtil,
  shouldGenerateUniqueName,
} from "@app/components/agent_builder/capabilities/mcp/utils/dialogUtils";
import { getDefaultFormValues } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { createFormResetHandler } from "@app/components/agent_builder/capabilities/mcp/utils/formStateUtils";
import {
  getMCPConfigurationFormSchema,
  validateMCPActionConfiguration,
} from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
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
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
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
  | {
      type: "configure";
      action: AgentBuilderAction;
      mcpServerView: MCPServerViewType;
    }
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

  const [selectedToolsInDialog, setSelectedToolsInDialog] = useState<
    SelectedTool[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [isOpen, setIsOpen] = useState(!!mode);
  const [currentPageId, setCurrentPageId] = useState<ConfigurationPagePageId>(
    getInitialPageId(mode)
  );
  const [configurationTool, setConfigurationTool] =
    useState<AgentBuilderAction | null>(getInitialConfigurationTool(mode));

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

  const allSelectableViews = useMemo(
    () => [
      ...selectableDefaultMCPServerViews,
      ...selectableNonDefaultMCPServerViews,
    ],
    [selectableDefaultMCPServerViews, selectableNonDefaultMCPServerViews]
  );

  const filteredViews = useMemo(() => {
    if (!searchTerm.trim()) {
      return allSelectableViews;
    }

    const searchTermLower = searchTerm.toLowerCase();
    return allSelectableViews.filter(
      (view) =>
        view.label.toLowerCase().includes(searchTermLower) ||
        view.description?.toLowerCase().includes(searchTermLower) ||
        view.name?.toLowerCase().includes(searchTermLower)
    );
  }, [allSelectableViews, searchTerm]);

  const showDataVisualization = useMemo(() => {
    if (!searchTerm.trim()) {
      return true;
    }
    if (!dataVisualization) {
      return false;
    }

    const searchTermLower = searchTerm.toLowerCase();
    return (
      dataVisualization.label.toLowerCase().includes(searchTermLower) ||
      dataVisualization.description?.toLowerCase().includes(searchTermLower) ||
      false
    );
  }, [searchTerm, dataVisualization]);

  useEffect(() => {
    if (mode?.type === "edit") {
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
    } else if (mode?.type === "configure") {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.CONFIGURATION);
      setConfigurationTool(mode.action);
      setConfigurationMCPServerView(mode.mcpServerView);
    } else if (mode?.type === "info") {
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
    } else if (mode?.type === "add") {
      setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
      setConfigurationTool(null);
      setConfigurationMCPServerView(null);
      setInfoMCPServerView(null);
      setSearchTerm("");
    }
    setIsOpen(!!mode);
  }, [mode, allMcpServerViews]);

  const toggleToolSelection = useCallback((tool: SelectedTool) => {
    setSelectedToolsInDialog((prev) => {
      const isAlreadySelected = prev.some((selected) => {
        if (
          tool.type === "DATA_VISUALIZATION" &&
          selected.type === "DATA_VISUALIZATION"
        ) {
          return true;
        }
        if (tool.type === "MCP" && selected.type === "MCP") {
          return tool.view.sId === selected.view.sId;
        }
        return false;
      });

      if (isAlreadySelected) {
        return prev.filter((selected) => {
          if (
            tool.type === "DATA_VISUALIZATION" &&
            selected.type === "DATA_VISUALIZATION"
          ) {
            return false;
          }
          if (tool.type === "MCP" && selected.type === "MCP") {
            return tool.view.sId !== selected.view.sId;
          }
          return true;
        });
      }

      return [...prev, tool];
    });
  }, []);

  // Data Visualization is not an action but we show like an action in UI.
  const onClickDataVisualization = useCallback(() => {
    if (dataVisualization) {
      toggleToolSelection({
        type: "DATA_VISUALIZATION",
      });
    }
  }, [dataVisualization, toggleToolSelection]);

  function onClickMCPServer(mcpServerView: MCPServerViewType) {
    const tool = { type: "MCP", view: mcpServerView } satisfies SelectedTool;
    const requirement = getMCPServerRequirements(mcpServerView);

    if (!requirement.noRequirement) {
      const action = getDefaultMCPAction(mcpServerView);
      const isReasoning = requirement.requiresReasoningConfiguration;

      let configuredAction = action;
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

        configuredAction = {
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
        };
      }

      // Switch to configure mode instead of directly setting states
      onModeChange({
        type: "configure",
        action: configuredAction,
        mcpServerView,
      });
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
    mode: "onSubmit",
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

  const resetToSelection = useCallback(() => {
    setCurrentPageId(CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION);
    setConfigurationTool(null);
    setConfigurationMCPServerView(null);
  }, []);

  const resetDialog = useCallback(() => {
    setSelectedToolsInDialog([]);
    setSearchTerm("");
    resetToSelection();
  }, [resetToSelection]);

  const pages: MultiPageDialogPage[] = [
    {
      id: CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION,
      title: actions.length === 0 ? "Add tools" : "Add more",
      description: "",
      icon: undefined,
      fixedContent: !isMCPServerViewsLoading ? (
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          name="search-mcp-servers"
          placeholder="Search servers..."
        />
      ) : undefined,
      content: isMCPServerViewsLoading ? (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <MCPServerSelectionPage
          mcpServerViews={filteredViews}
          onItemClick={onClickMCPServer}
          dataVisualization={showDataVisualization ? dataVisualization : null}
          onDataVisualizationClick={onClickDataVisualization}
          selectedToolsInDialog={selectedToolsInDialog}
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

                <AdditionalConfigurationSection
                  requiredStrings={requirements.requiredStrings}
                  requiredNumbers={requirements.requiredNumbers}
                  requiredBooleans={requirements.requiredBooleans}
                  requiredEnums={requirements.requiredEnums}
                  requiredLists={requirements.requiredLists}
                />
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
        <div className="flex h-full flex-col space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground-night">
                Server Details
              </h3>
              <div className="flex items-center space-x-3 rounded-lg border border-border bg-muted-background p-4 dark:border-border-night dark:bg-muted-background-night">
                {getAvatarFromIcon(infoMCPServerView.server.icon, "md")}
                <div className="flex-1 space-y-1">
                  <div className="text-base font-medium text-foreground dark:text-foreground-night">
                    {getMcpServerViewDisplayName(infoMCPServerView)}
                  </div>
                  <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    {infoMCPServerView.server.description ||
                      "No description available"}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground dark:text-foreground-night">
                  Available Tools
                </h3>
                <Chip
                  size="xs"
                  color="info"
                  label={`${infoMCPServerView.server.tools?.length || 0} tools`}
                />
              </div>

              {infoMCPServerView.server.tools &&
              infoMCPServerView.server.tools.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <span className="text-md text-muted-foreground dark:text-muted-foreground-night">
                    These tools will be available to your agent during
                    conversations and can be configured with different
                    permission levels:
                  </span>
                  <ToolsList
                    owner={owner}
                    mcpServerView={infoMCPServerView}
                    disableUpdates
                  />
                </div>
              ) : (
                <ContentMessage variant="primary" size="sm">
                  No tools are currently available for this server.
                </ContentMessage>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ),
    },
  ];

  const currentMode = mode?.type ?? "add";

  const handleCancel = () => {
    setIsOpen(false);
    onModeChange(null);
    if (currentMode) {
      resetDialog();
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

      const isNewActionOrNameChanged = shouldGenerateUniqueName(
        mode,
        defaultFormValues,
        formData
      );

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

      handleConfigurationSaveUtil({
        mode,
        configuredAction,
        mcpServerView,
        onActionUpdate,
        onModeChange,
        setSelectedToolsInDialog,
        setIsOpen,
        sendNotification,
      });

      // Handle legacy navigation for non-configure modes
      if (mode?.type !== "edit" && mode?.type !== "configure") {
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

  const { leftButton, rightButton } = getFooterButtons({
    currentPageId,
    modeType: currentMode,
    selectedToolsInDialog,
    form,
    onCancel: handleCancel,
    onModeChange,
    onAddSelectedTools: () => {
      handleAddSelectedTools();
      setIsOpen(false);
      onModeChange(null);
    },
    onConfigurationSave: handleConfigurationSave,
    resetToSelection,
  });

  return (
    <MultiPageDialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open && currentMode === "add") {
          resetDialog();
        }

        if (!open) {
          onModeChange(null);
        }
      }}
    >
      <MultiPageDialogContent
        showNavigation={false}
        showHeaderNavigation={false}
        isAlertDialog
        size="2xl"
        height="xl"
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={(pageId) => {
          if (pageId === CONFIGURATION_DIALOG_PAGE_IDS.TOOL_SELECTION) {
            resetToSelection();
          } else {
            setCurrentPageId(pageId as ConfigurationPagePageId);
          }
        }}
        leftButton={leftButton}
        rightButton={rightButton}
        addFooterSeparator
        footerContent={
          currentMode !== "configure" ? (
            <MCPServerViewsFooter
              selectedToolsInDialog={selectedToolsInDialog}
              dataVisualization={dataVisualization}
              onRemoveSelectedTool={toggleToolSelection}
            />
          ) : undefined
        }
      />
    </MultiPageDialog>
  );
}
