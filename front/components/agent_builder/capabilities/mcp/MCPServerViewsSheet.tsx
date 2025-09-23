import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import uniqueId from "lodash/uniqueId";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UseFieldArrayAppend } from "react-hook-form";
import { useForm } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderFormData,
  MCPFormData,
  MCPServerConfigurationType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { MCPActionHeader } from "@app/components/agent_builder/capabilities/mcp/MCPActionHeader";
import { MCPServerInfoPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerInfoPage";
import { MCPServerSelectionPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerSelectionPage";
import { MCPServerViewsFooter } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsFooter";
import {
  generateUniqueActionName,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultFormValues } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { createFormResetHandler } from "@app/components/agent_builder/capabilities/mcp/utils/formStateUtils";
import {
  getMCPConfigurationFormSchema,
  validateMCPActionConfiguration,
} from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import {
  getInfoPageDescription,
  getInfoPageIcon,
  getInfoPageTitle,
} from "@app/components/agent_builder/capabilities/mcp/utils/infoPageUtils";
import {
  getFooterButtons,
  getInitialConfigurationTool,
  getInitialPageId,
  handleConfigurationSave as handleConfigurationSaveUtil,
  shouldGenerateUniqueName,
} from "@app/components/agent_builder/capabilities/mcp/utils/sheetUtils";
import { AdditionalConfigurationSection } from "@app/components/agent_builder/capabilities/shared/AdditionalConfigurationSection";
import { ChildAgentSection } from "@app/components/agent_builder/capabilities/shared/ChildAgentSection";
import { DustAppSection } from "@app/components/agent_builder/capabilities/shared/DustAppSection";
import { JsonSchemaSection } from "@app/components/agent_builder/capabilities/shared/JsonSchemaSection";
import { NameSection } from "@app/components/agent_builder/capabilities/shared/NameSection";
import { ReasoningModelSection } from "@app/components/agent_builder/capabilities/shared/ReasoningModelSection";
import { SecretSection } from "@app/components/agent_builder/capabilities/shared/SecretSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import type { MCPServerViewTypeWithLabel } from "@app/components/agent_builder/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/agent_builder/MCPServerViewsContext";
import type {
  ActionSpecification,
  AgentBuilderAction,
  ConfigurationPagePageId,
} from "@app/components/agent_builder/types";
import {
  getDefaultMCPAction,
  TOOLS_SHEET_PAGE_IDS,
} from "@app/components/agent_builder/types";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
  DEFAULT_DATA_VISUALIZATION_NAME,
} from "@app/lib/actions/constants";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useModels } from "@app/lib/swr/models";
import { DEFAULT_REASONING_MODEL_ID } from "@app/types";

export type SelectedTool =
  | {
      type: "MCP";
      view: MCPServerViewType;
      configuredAction?: AgentBuilderAction;
    }
  | { type: "DATA_VISUALIZATION" };

export type SheetMode =
  | { type: "add" }
  | {
      type: "configure";
      action: AgentBuilderAction;
      mcpServerView: MCPServerViewType;
    }
  | { type: "edit"; action: AgentBuilderAction; index: number }
  | {
      type: "info";
      action: AgentBuilderAction;
      source: "toolDetails" | "addedTool";
    };

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

interface MCPServerViewsSheetProps {
  addTools: UseFieldArrayAppend<AgentBuilderFormData, "actions">;
  dataVisualization: ActionSpecification | null;
  mode: SheetMode | null;
  onModeChange: (mode: SheetMode | null) => void;
  onActionUpdate?: (action: AgentBuilderAction, index: number) => void;
  actions: AgentBuilderAction[];
  getAgentInstructions: () => string;
}

export function MCPServerViewsSheet({
  addTools,
  dataVisualization,
  mode,
  onModeChange,
  onActionUpdate,
  actions,
  getAgentInstructions,
}: MCPServerViewsSheetProps) {
  const { owner } = useAgentBuilderContext();
  const sendNotification = useSendNotification();
  const { reasoningModels } = useModels({ owner });
  const {
    mcpServerViews: allMcpServerViews,
    defaultMCPServerViews,
    nonDefaultMCPServerViews,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const [selectedToolsInSheet, setSelectedToolsInSheet] = useState<
    SelectedTool[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Utility function to check if a server view should be filtered out based on allowMultipleInstances
  const shouldFilterServerView = useCallback(
    (view: MCPServerViewTypeWithLabel, actions: AgentBuilderAction[]) => {
      // For servers that don't allow multiple instances, check if any action is using this server type
      if (!view.server.allowMultipleInstances) {
        const serverAlreadyUsed = actions.some((action) => {
          // Check if this is an MCP action with the same server ID
          return (
            action.type === "MCP" &&
            action.configuration &&
            action.configuration.mcpServerViewId === view.sId
          );
        });

        if (serverAlreadyUsed) {
          return true;
        }
      }

      // Avoid name-based filtering to prevent collisions with user-defined action names.
      // For backward compatibility with older actions, only filter if there is an MCP action
      // explicitly tied to this server view and that action is non-configurable.
      const selectedAction = actions.find(
        (action) =>
          action.type === "MCP" &&
          action.configuration &&
          action.configuration.mcpServerViewId === view.sId
      );
      return !!selectedAction;
    },
    []
  );

  const selectableDefaultMCPServerViews = useMemo(() => {
    const filteredList = defaultMCPServerViews.filter(
      (view) => !shouldFilterServerView(view, actions)
    );

    if (hasReasoningModel) {
      return filteredList;
    }

    return filteredList.filter(
      (view) => !getMCPServerToolsConfigurations(view).reasoningConfiguration
    );
  }, [
    defaultMCPServerViews,
    actions,
    hasReasoningModel,
    shouldFilterServerView,
  ]);

  const selectableNonDefaultMCPServerViews = useMemo(
    () =>
      nonDefaultMCPServerViews.filter(
        (view) => !shouldFilterServerView(view, actions)
      ),
    [nonDefaultMCPServerViews, actions, shouldFilterServerView]
  );

  const filteredViews = useMemo(() => {
    const filterViews = (views: MCPServerViewTypeWithLabel[]) =>
      !searchTerm.trim()
        ? views
        : views.filter((view) => {
            const term = searchTerm.toLowerCase();
            return [view.label, view.server.description, view.server.name].some(
              (field) => field?.toLowerCase().includes(term)
            );
          });

    return {
      defaultViews: filterViews(selectableDefaultMCPServerViews),
      nonDefaultViews: filterViews(selectableNonDefaultMCPServerViews),
    };
  }, [
    searchTerm,
    selectableDefaultMCPServerViews,
    selectableNonDefaultMCPServerViews,
  ]);
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
      setCurrentPageId(TOOLS_SHEET_PAGE_IDS.CONFIGURATION);
      setConfigurationTool(mode.action);
      setSelectedToolsInSheet([]);

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
      setCurrentPageId(TOOLS_SHEET_PAGE_IDS.CONFIGURATION);
      setConfigurationTool(mode.action);
      setConfigurationMCPServerView(mode.mcpServerView);
    } else if (mode?.type === "info") {
      setCurrentPageId(TOOLS_SHEET_PAGE_IDS.INFO);
      setSelectedToolsInSheet([]);

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
      } else {
        setInfoMCPServerView(null);
      }
    } else if (mode?.type === "add") {
      setCurrentPageId(TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION);
      setConfigurationTool(null);
      setConfigurationMCPServerView(null);
      setInfoMCPServerView(null);
      setSearchTerm("");
    }
    setIsOpen(!!mode);
  }, [mode, allMcpServerViews]);

  // Focus SearchInput when opening on TOOL_SELECTION page
  useEffect(() => {
    if (isOpen && currentPageId === TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION) {
      // Small delay to ensure the component is fully rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, currentPageId]);

  const toggleToolSelection = useCallback((tool: SelectedTool) => {
    setSelectedToolsInSheet((prev) => {
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
    const toolsConfigurations = getMCPServerToolsConfigurations(mcpServerView);

    if (toolsConfigurations.configurable !== "no") {
      const action = getDefaultMCPAction(mcpServerView);
      const isReasoning = toolsConfigurations.reasoningConfiguration
        ? true
        : false;

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
            (model) =>
              model.modelId ===
              toolsConfigurations.reasoningConfiguration?.default?.modelId
          ) ??
          reasoningModels.find(
            (model) => model.modelId === DEFAULT_REASONING_MODEL_ID
          ) ??
          reasoningModels[0];

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

        // For reasoning tools, add directly to selected tools instead of going to configure page
        toggleToolSelection({
          type: "MCP",
          view: mcpServerView,
          configuredAction,
        });
        return;
      }

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

  const handleToolInfoClick = useCallback(
    (mcpServerView: MCPServerViewType) => {
      const action = getDefaultMCPAction(mcpServerView);
      onModeChange({
        type: "info",
        action,
        source: "toolDetails",
      });
    },
    [onModeChange]
  );

  const handleAddSelectedTools = useCallback(() => {
    // Validate any configured tools before adding
    for (const tool of selectedToolsInSheet) {
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
      selectedToolsInSheet.map((tool) => {
        if (tool.type === "DATA_VISUALIZATION") {
          return {
            id: uniqueId(),
            type: "DATA_VISUALIZATION",
            configuration: null,
            name: DEFAULT_DATA_VISUALIZATION_NAME,
            description: DEFAULT_DATA_VISUALIZATION_DESCRIPTION,
            configurable: false,
          };
        } else {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          return tool.configuredAction || getDefaultMCPAction(tool.view);
        }
      })
    );

    setSelectedToolsInSheet([]);
  }, [selectedToolsInSheet, addTools, sendNotification]);

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

  const toolsConfigurations = useMemo(
    () =>
      mcpServerView ? getMCPServerToolsConfigurations(mcpServerView) : null,
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
    setCurrentPageId(TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION);
    setConfigurationTool(null);
    setConfigurationMCPServerView(null);
  }, []);

  const resetSheet = useCallback(() => {
    setSelectedToolsInSheet([]);
    setSearchTerm("");
    resetToSelection();
  }, [resetToSelection]);

  const pages: MultiPageSheetPage[] = [
    {
      id: TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION,
      title: actions.length === 0 ? "Add tools" : "Add more",
      description: "",
      icon: undefined,
      content: isMCPServerViewsLoading ? (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {!isMCPServerViewsLoading && (
            <SearchInput
              ref={searchInputRef}
              value={searchTerm}
              onChange={setSearchTerm}
              name="search-mcp"
              placeholder="Search tools..."
              className="mt-4"
            />
          )}
          <MCPServerSelectionPage
            defaultMcpServerViews={filteredViews.defaultViews}
            nonDefaultMcpServerViews={filteredViews.nonDefaultViews}
            onItemClick={onClickMCPServer}
            dataVisualization={showDataVisualization ? dataVisualization : null}
            onDataVisualizationClick={onClickDataVisualization}
            selectedToolsInSheet={selectedToolsInSheet}
            onToolDetailsClick={(tool) => {
              if (tool.type === "MCP") {
                handleToolInfoClick(tool.view);
              }
            }}
          />
        </>
      ),
      footerContent:
        selectedToolsInSheet.length > 0 ? (
          <MCPServerViewsFooter
            selectedToolsInSheet={selectedToolsInSheet}
            dataVisualization={dataVisualization}
            onRemoveSelectedTool={toggleToolSelection}
          />
        ) : undefined,
    },
    {
      id: TOOLS_SHEET_PAGE_IDS.CONFIGURATION,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      title: mcpServerView?.name || "Configure Tool",
      description: "",
      icon: undefined,
      content:
        configurationTool &&
        mcpServerView &&
        toolsConfigurations &&
        formSchema ? (
          <FormProvider form={form} className="h-full">
            <div className="h-full">
              <div className="h-full space-y-6 pt-3">
                <MCPActionHeader
                  action={configurationTool}
                  mcpServerView={mcpServerView}
                />

                {configurationTool.configurable && (
                  <NameSection
                    title="Name"
                    placeholder="My tool name…"
                    triggerValidationOnChange
                  />
                )}

                {toolsConfigurations.reasoningConfiguration && (
                  <ReasoningModelSection />
                )}

                {toolsConfigurations.childAgentConfiguration && (
                  <ChildAgentSection />
                )}

                {toolsConfigurations.mayRequireTimeFrameConfiguration && (
                  <TimeFrameSection actionType="search" />
                )}

                {toolsConfigurations.mayRequireDustAppConfiguration && (
                  <DustAppSection />
                )}

                {toolsConfigurations.mayRequireSecretConfiguration && (
                  <SecretSection />
                )}

                {toolsConfigurations.mayRequireJsonSchemaConfiguration && (
                  <JsonSchemaSection
                    getAgentInstructions={getAgentInstructions}
                  />
                )}

                <AdditionalConfigurationSection
                  stringConfigurations={
                    toolsConfigurations.stringConfigurations
                  }
                  numberConfigurations={
                    toolsConfigurations.numberConfigurations
                  }
                  booleanConfigurations={
                    toolsConfigurations.booleanConfigurations
                  }
                  enumConfigurations={toolsConfigurations.enumConfigurations}
                  listConfigurations={toolsConfigurations.listConfigurations}
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
      id: TOOLS_SHEET_PAGE_IDS.INFO,
      title: getInfoPageTitle(
        infoMCPServerView,
        mode?.type === "info" ? mode.action : null
      ),
      description: getInfoPageDescription(
        infoMCPServerView,
        mode?.type === "info" ? mode.action : null
      ),
      icon: getInfoPageIcon(
        infoMCPServerView,
        mode?.type === "info" ? mode.action : null
      ),
      content:
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        infoMCPServerView ||
        (mode?.type === "info" &&
          mode.action?.type === "DATA_VISUALIZATION") ? (
          <MCPServerInfoPage
            infoMCPServerView={infoMCPServerView}
            infoAction={mode?.type === "info" ? mode.action : null}
          />
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
      resetSheet();
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
            baseName: nameToStorageFormat(formData.name),
            existingActions: actions,
            selectedToolsInSheet,
          })
        : mode?.type === "edit"
          ? configurationTool.name
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
        setSelectedToolsInSheet,
        setIsOpen,
        sendNotification,
      });

      // Handle legacy navigation for non-configure modes
      if (mode?.type !== "edit" && mode?.type !== "configure") {
        setCurrentPageId(TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION);
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

  const footerButtons = getFooterButtons({
    currentPageId,
    mode,
    selectedToolsInSheet,
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
    <MultiPageSheet
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open && currentMode === "add") {
          resetSheet();
        }

        if (!open) {
          onModeChange(null);
        }
      }}
    >
      <MultiPageSheetContent
        className="h-full"
        showNavigation={false}
        showHeaderNavigation={false}
        size="xl"
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={(pageId) => {
          if (pageId === TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION) {
            resetToSelection();
          } else {
            setCurrentPageId(pageId as ConfigurationPagePageId);
          }
        }}
        addFooterSeparator
        {...footerButtons}
      />
    </MultiPageSheet>
  );
}
