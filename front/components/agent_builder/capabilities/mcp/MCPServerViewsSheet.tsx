import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  MultiPageSheet,
  MultiPageSheetContent,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
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
import { SecretSection } from "@app/components/agent_builder/capabilities/shared/SecretSection";
import { TimeFrameSection } from "@app/components/agent_builder/capabilities/shared/TimeFrameSection";
import type { ConfigurationPagePageId } from "@app/components/agent_builder/types";
import {
  getDefaultMCPAction,
  TOOLS_SHEET_PAGE_IDS,
} from "@app/components/agent_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type {
  BuilderAction,
  MCPServerConfigurationType,
} from "@app/components/shared/tools_picker/types";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

const TOP_MCP_SERVER_VIEWS = [
  "web_search_&_browse",
  "image_generation",
  AGENT_MEMORY_SERVER_NAME,
  "deep_dive",
  "interactive_content",
  "slack",
  "gmail",
  "google_calendar",
];

export type SelectedTool = {
  view: MCPServerViewTypeWithLabel;
  configuredAction?: BuilderAction;
};

export type SheetMode =
  | { type: "add" }
  | {
      type: "configure";
      action: BuilderAction;
      mcpServerView: MCPServerViewTypeWithLabel;
    }
  | { type: "edit"; action: BuilderAction; index: number }
  | {
      type: "info";
      action: BuilderAction;
      source: "toolDetails" | "addedTool";
    };

type MCPActionWithConfiguration = BuilderAction & {
  type: "MCP";
  configuration: MCPServerConfigurationType;
};

function isMCPActionWithConfiguration(
  action: BuilderAction
): action is MCPActionWithConfiguration {
  return (
    action.configuration !== null &&
    action.configuration !== undefined &&
    typeof action.configuration === "object" &&
    "mcpServerViewId" in action.configuration
  );
}

interface MCPServerViewsSheetProps {
  addTools: (action: BuilderAction | BuilderAction[]) => void;
  mode: SheetMode | null;
  onModeChange: (mode: SheetMode | null) => void;
  onActionUpdate?: (action: BuilderAction, index: number) => void;
  selectedActions: BuilderAction[];
  getAgentInstructions: () => string;
  /** Optional filter to restrict which MCP server views are shown */
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
}

export function MCPServerViewsSheet({
  addTools,
  mode,
  onModeChange,
  onActionUpdate,
  selectedActions,
  getAgentInstructions,
  filterMCPServerViews,
}: MCPServerViewsSheetProps) {
  const confirm = React.useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const {
    mcpServerViews: allMcpServerViews,
    mcpServerViewsWithKnowledge,
    mcpServerViewsWithoutKnowledge,
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
    useState<BuilderAction | null>(getInitialConfigurationTool(mode));

  const [configurationMCPServerView, setConfigurationMCPServerView] =
    useState<MCPServerViewTypeWithLabel | null>(null);
  const [infoMCPServerView, setInfoMCPServerView] =
    useState<MCPServerViewType | null>(null);

  const shouldFilterServerView = useCallback(
    (view: MCPServerViewTypeWithLabel, actions: BuilderAction[]) => {
      // Build the set of server.sId already selected by actions (via their selected view).
      const selectedServerIds = new Set<string>();
      for (const action of actions) {
        if (
          action.configuration &&
          action.configuration.mcpServerViewId &&
          !action.configurationRequired
        ) {
          const selectedView = allMcpServerViews.find(
            (mcpServerView) =>
              mcpServerView.sId === action.configuration.mcpServerViewId
          );
          if (selectedView) {
            selectedServerIds.add(selectedView.server.sId);
          }
        }
      }
      return selectedServerIds.has(view.server.sId);
    },
    [allMcpServerViews]
  );

  const topMCPServerViews = useMemo(() => {
    const views = mcpServerViewsWithoutKnowledge.filter((view) =>
      TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );
    return filterMCPServerViews ? views.filter(filterMCPServerViews) : views;
  }, [mcpServerViewsWithoutKnowledge, filterMCPServerViews]);

  const nonTopMCPServerViews = useMemo(() => {
    const views = mcpServerViewsWithoutKnowledge.filter(
      (view) => !TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );
    return filterMCPServerViews ? views.filter(filterMCPServerViews) : views;
  }, [mcpServerViewsWithoutKnowledge, filterMCPServerViews]);

  const selectableTopMCPServerViews = useMemo(() => {
    return topMCPServerViews.filter(
      (view) => !shouldFilterServerView(view, selectedActions)
    );
  }, [topMCPServerViews, selectedActions, shouldFilterServerView]);

  const selectableNonTopMCPServerViews = useMemo(
    () =>
      nonTopMCPServerViews.filter(
        (view) => !shouldFilterServerView(view, selectedActions)
      ),
    [nonTopMCPServerViews, selectedActions, shouldFilterServerView]
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
      topViews: filterViews(selectableTopMCPServerViews),
      nonTopViews: filterViews(selectableNonTopMCPServerViews),
    };
  }, [searchTerm, selectableTopMCPServerViews, selectableNonTopMCPServerViews]);

  useEffect(() => {
    if (mode?.type === "edit") {
      setCurrentPageId(TOOLS_SHEET_PAGE_IDS.CONFIGURATION);
      setConfigurationTool(mode.action);
      setSelectedToolsInSheet([]);

      const action = mode.action;
      if (isMCPActionWithConfiguration(action)) {
        const labeledViews: MCPServerViewTypeWithLabel[] = [
          ...mcpServerViewsWithKnowledge,
          ...mcpServerViewsWithoutKnowledge,
        ];
        const mcpServerView = labeledViews.find(
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
  }, [
    mode,
    allMcpServerViews,
    mcpServerViewsWithKnowledge,
    mcpServerViewsWithoutKnowledge,
  ]);

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
        return tool.view.sId === selected.view.sId;
      });

      if (isAlreadySelected) {
        return prev.filter((selected) => {
          return tool.view.sId !== selected.view.sId;
        });
      }

      return [...prev, tool];
    });
  }, []);

  function onClickMCPServer(mcpServerView: MCPServerViewTypeWithLabel) {
    const tool = { view: mcpServerView } satisfies SelectedTool;
    const requirements = getMCPServerRequirements(mcpServerView);

    if (!requirements.noRequirement) {
      const action = getDefaultMCPAction(mcpServerView);

      onModeChange({
        type: "configure",
        action,
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
      if (tool.configuredAction) {
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
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return tool.configuredAction || getDefaultMCPAction(tool.view);
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
    if (configurationTool) {
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
      title: selectedActions.length === 0 ? "Add tools" : "Add more",
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
            topMCPServerViews={filteredViews.topViews}
            nonTopMCPServerViews={filteredViews.nonTopViews}
            onItemClick={onClickMCPServer}
            selectedToolsInSheet={selectedToolsInSheet}
            onToolDetailsClick={(tool) => {
              handleToolInfoClick(tool.view);
            }}
          />
        </>
      ),
      footerContent:
        selectedToolsInSheet.length > 0 ? (
          <MCPServerViewsFooter
            selectedToolsInSheet={selectedToolsInSheet}
            onRemoveSelectedTool={toggleToolSelection}
          />
        ) : undefined,
    },
    {
      id: TOOLS_SHEET_PAGE_IDS.CONFIGURATION,
      title: `Configure ${mcpServerView?.label ?? "tool"}`,
      description: "",
      icon: mcpServerView
        ? () => getAvatar(mcpServerView.server, "md")
        : undefined,
      content:
        configurationTool && mcpServerView && requirements && formSchema ? (
          <FormProvider form={form} className="h-full">
            <div className="h-full">
              <div className="h-full space-y-6 pt-3">
                {configurationTool.configurationRequired && (
                  <NameSection
                    title="Name"
                    placeholder="My tool name…"
                    triggerValidationOnChange
                  />
                )}

                {requirements.requiresChildAgentConfiguration && (
                  <ChildAgentSection />
                )}

                {requirements.mayRequireTimeFrameConfiguration && (
                  <TimeFrameSection actionType="search" />
                )}

                {requirements.requiresDustAppConfiguration && (
                  <DustAppSection />
                )}

                {requirements.developerSecretSelection && (
                  <SecretSection
                    customDescription={
                      mcpServerView.server
                        .developerSecretSelectionDescription ?? undefined
                    }
                  />
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
      id: TOOLS_SHEET_PAGE_IDS.INFO,
      title: getInfoPageTitle(infoMCPServerView),
      description: getInfoPageDescription(infoMCPServerView),
      icon: getInfoPageIcon(infoMCPServerView),
      content: infoMCPServerView ? (
        <MCPServerInfoPage infoMCPServerView={infoMCPServerView} />
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
      const isNewActionOrNameChanged = shouldGenerateUniqueName(
        mode,
        defaultFormValues,
        formData
      );

      const newActionName = isNewActionOrNameChanged
        ? generateUniqueActionName({
            baseName: nameToStorageFormat(formData.name),
            existingActions: selectedActions,
            selectedToolsInSheet,
          })
        : mode?.type === "edit"
          ? configurationTool.name
          : formData.name;

      const configuredAction: BuilderAction = {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      onOpenChange={async (open) => {
        if (!open && selectedToolsInSheet.length > 0) {
          const confirmed = await confirm({
            title: "Unsaved changes",
            message:
              "You have selected tools that are not added yet. Are you sure you want to close without adding them?",
            validateLabel: "Discard selection",
            validateVariant: "warning",
          });

          if (!confirmed) {
            return;
          }
        }

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
