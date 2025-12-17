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

import type {
  AgentBuilderSkillsType,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { CapabilityFilterType } from "@app/components/agent_builder/capabilities/mcp/CapabilitiesSelectionPage";
import { CapabilitiesSelectionPage } from "@app/components/agent_builder/capabilities/mcp/CapabilitiesSelectionPage";
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
  getMcpInfoPageDescription,
  getMcpInfoPageIcon,
  getMcpInfoPageTitle,
  getSelectionPageTitle,
  getSkillInfoPageDescription,
  getSkillInfoPageIcon,
  getSkillInfoPageTitle,
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
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import type { MCPServerConfigurationType } from "@app/components/shared/tools_picker/types";
import { useBuilderContext } from "@app/components/shared/useBuilderContext";
import { SkillDetailsSheetContent } from "@app/components/skills/SkillDetailsSheet";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";

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
  type: "MCP";
  view: MCPServerViewTypeWithLabel;
  configuredAction?: BuilderAction;
};

export type SkillSelection = SkillType & { relations: SkillRelations };

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
    }
  | {
      type: "skill-info";
      skill: SkillSelection;
      source: "skillDetails" | "addedSkill";
    };

type MCPActionWithConfiguration = BuilderAction & {
  type: "MCP";
  configuration: MCPServerConfigurationType;
};

function isMCPActionWithConfiguration(
  action: BuilderAction
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
  addTools: (action: BuilderAction | BuilderAction[]) => void;
  mode: SheetMode | null;
  onModeChange: (mode: SheetMode | null) => void;
  onActionUpdate?: (action: BuilderAction, index: number) => void;
  selectedActions: BuilderAction[];
  getAgentInstructions: () => string;
  /** Optional filter to restrict which MCP server views are shown */
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
  // Skills props (optional - only used by agent builder, not skill builder)
  skills?: SkillSelection[];
  isSkillsLoading?: boolean;
  onAddSkills?: (skills: AgentBuilderSkillsType[]) => void;
  selectedSkills?: AgentBuilderSkillsType[];
}

export function MCPServerViewsSheet({
  addTools,
  mode,
  onModeChange,
  onActionUpdate,
  selectedActions,
  getAgentInstructions,
  filterMCPServerViews,
  skills = [],
  isSkillsLoading = false,
  onAddSkills,
  selectedSkills = [],
}: MCPServerViewsSheetProps) {
  const { owner, user } = useBuilderContext();
  const confirm = React.useContext(ConfirmContext);
  const sendNotification = useSendNotification();
  const { featureFlags, hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const {
    mcpServerViews: allMcpServerViews,
    mcpServerViewsWithKnowledge,
    mcpServerViewsWithoutKnowledge,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const showSkills = hasFeature("skills");

  const [selectedToolsInSheet, setSelectedToolsInSheet] = useState<
    SelectedTool[]
  >([]);
  const [selectedSkillsInSheet, setSelectedSkillsInSheet] = useState<
    SkillSelection[]
  >([]);
  const [capabilityFilter, setCapabilityFilter] =
    useState<CapabilityFilterType>("all");
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
  const [infoSkill, setInfoSkill] = useState<SkillSelection | null>(null);

  const shouldFilterServerView = useCallback(
    (view: MCPServerViewTypeWithLabel, actions: BuilderAction[]) => {
      // Build the set of server.sId already selected by actions (via their selected view).
      const selectedServerIds = new Set<string>();
      for (const action of actions) {
        if (
          action.type === "MCP" &&
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
    const filteredList = topMCPServerViews.filter(
      (view) => !shouldFilterServerView(view, selectedActions)
    );

    return filteredList;
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

  const selectableSkills = useMemo(() => {
    const alreadyAddedIds = new Set(selectedSkills.map((s) => s.sId));
    return skills.filter((skill) => !alreadyAddedIds.has(skill.sId));
  }, [skills, selectedSkills]);

  // TODO(skills 2025-12-17): Search should apply to ALL items (skills + tools) regardless of filter.
  // Currently filter controls both visibility AND search scope. Filter should only control visibility.
  const filteredSkills = useMemo(() => {
    if (!searchTerm.trim()) {
      return selectableSkills;
    }
    const term = searchTerm.toLowerCase();
    return selectableSkills.filter((skill) =>
      [skill.name, skill.userFacingDescription].some((field) =>
        field?.toLowerCase().includes(term)
      )
    );
  }, [searchTerm, selectableSkills]);

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
    } else if (mode?.type === "skill-info") {
      setCurrentPageId(TOOLS_SHEET_PAGE_IDS.SKILL_INFO);
      setInfoSkill(mode.skill);
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
        if (tool.type === "MCP" && selected.type === "MCP") {
          return tool.view.sId === selected.view.sId;
        }
        return false;
      });

      if (isAlreadySelected) {
        return prev.filter((selected) => {
          if (tool.type === "MCP" && selected.type === "MCP") {
            return tool.view.sId !== selected.view.sId;
          }
          return true;
        });
      }

      return [...prev, tool];
    });
  }, []);

  const toggleSkillSelection = useCallback((skill: SkillSelection) => {
    setSelectedSkillsInSheet((prev) => {
      const isAlreadySelected = prev.some((s) => s.sId === skill.sId);
      if (isAlreadySelected) {
        return prev.filter((s) => s.sId !== skill.sId);
      }
      return [...prev, skill];
    });
  }, []);

  function onClickMCPServer(mcpServerView: MCPServerViewTypeWithLabel) {
    const tool = { type: "MCP", view: mcpServerView } satisfies SelectedTool;
    const requirements = getMCPServerRequirements(mcpServerView, featureFlags);

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

  const handleSkillInfoClick = useCallback(
    (skill: SkillSelection) => {
      onModeChange({
        type: "skill-info",
        skill,
        source: "skillDetails",
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

    // Add MCP tools
    if (selectedToolsInSheet.length > 0) {
      addTools(
        selectedToolsInSheet.map((tool) => {
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          return tool.configuredAction || getDefaultMCPAction(tool.view);
        })
      );
    }

    // Add skills
    if (selectedSkillsInSheet.length > 0 && onAddSkills) {
      const skillsToAdd: AgentBuilderSkillsType[] = selectedSkillsInSheet.map(
        (skill) => ({
          sId: skill.sId,
          name: skill.name,
          description: skill.userFacingDescription,
        })
      );
      onAddSkills(skillsToAdd);
    }

    setSelectedToolsInSheet([]);
    setSelectedSkillsInSheet([]);
  }, [
    selectedToolsInSheet,
    selectedSkillsInSheet,
    addTools,
    onAddSkills,
    sendNotification,
  ]);

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
    () =>
      mcpServerView
        ? getMCPServerRequirements(mcpServerView, featureFlags)
        : null,
    [mcpServerView, featureFlags]
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
    setSelectedSkillsInSheet([]);
    setCapabilityFilter("all");
    setSearchTerm("");
    resetToSelection();
  }, [resetToSelection]);

  const isLoading = isMCPServerViewsLoading || isSkillsLoading;
  const hasAnySelection =
    selectedToolsInSheet.length > 0 || selectedSkillsInSheet.length > 0;

  const pages: MultiPageSheetPage[] = [
    {
      id: TOOLS_SHEET_PAGE_IDS.TOOL_SELECTION,
      title: getSelectionPageTitle(selectedActions.length > 0, showSkills),
      description: "",
      icon: undefined,
      content: isLoading ? (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <SearchInput
            ref={searchInputRef}
            value={searchTerm}
            onChange={setSearchTerm}
            name="search-mcp"
            placeholder={
              showSkills ? "Search capabilities..." : "Search tools..."
            }
            className="mt-4"
          />
          {showSkills ? (
            <CapabilitiesSelectionPage
              filter={capabilityFilter}
              onFilterChange={setCapabilityFilter}
              showSkills={showSkills}
              topMCPServerViews={filteredViews.topViews}
              nonTopMCPServerViews={filteredViews.nonTopViews}
              selectedToolsInSheet={selectedToolsInSheet}
              onToolClick={onClickMCPServer}
              onToolDetailsClick={handleToolInfoClick}
              skills={filteredSkills}
              selectedSkillsInSheet={selectedSkillsInSheet}
              onSkillClick={toggleSkillSelection}
              onSkillDetailsClick={handleSkillInfoClick}
              featureFlags={featureFlags}
            />
          ) : (
            <MCPServerSelectionPage
              topMCPServerViews={filteredViews.topViews}
              nonTopMCPServerViews={filteredViews.nonTopViews}
              onItemClick={onClickMCPServer}
              selectedToolsInSheet={selectedToolsInSheet}
              onToolDetailsClick={(tool) => {
                if (tool.type === "MCP") {
                  handleToolInfoClick(tool.view);
                }
              }}
              featureFlags={featureFlags}
            />
          )}
        </>
      ),
      footerContent: hasAnySelection ? (
        <MCPServerViewsFooter
          selectedToolsInSheet={selectedToolsInSheet}
          selectedSkillsInSheet={selectedSkillsInSheet}
          onRemoveSelectedTool={toggleToolSelection}
          onRemoveSelectedSkill={toggleSkillSelection}
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
      title: getMcpInfoPageTitle(infoMCPServerView),
      description: getMcpInfoPageDescription(infoMCPServerView),
      icon: getMcpInfoPageIcon(infoMCPServerView),
      content: infoMCPServerView ? (
        <MCPServerInfoPage infoMCPServerView={infoMCPServerView} />
      ) : (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ),
    },
    {
      id: TOOLS_SHEET_PAGE_IDS.SKILL_INFO,
      title: getSkillInfoPageTitle(infoSkill),
      description: getSkillInfoPageDescription(infoSkill),
      icon: getSkillInfoPageIcon(),
      content: infoSkill ? (
        <SkillDetailsSheetContent skill={infoSkill} owner={owner} user={user} />
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
    selectedSkillsInSheet,
    showSkills,
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
