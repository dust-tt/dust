import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type {
  AgentBuilderSkillsType,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  generateUniqueActionName,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultFormValues } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { createFormResetHandler } from "@app/components/agent_builder/capabilities/mcp/utils/formStateUtils";
import { getMCPConfigurationFormSchema } from "@app/components/agent_builder/capabilities/mcp/utils/formValidation";
import type {
  CapabilityFilterType,
  SelectedTool,
  SkillsSheetMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/skills/skillSheet/utils";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { useSendNotification } from "@app/hooks/useNotification";
import type { UserType, WorkspaceType } from "@app/types";

interface SkillsSheetProps {
  mode: SkillsSheetMode | null;
  onClose: () => void;
  onSave: (
    skills: AgentBuilderSkillsType[],
    additionalSpaces: string[]
  ) => void;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  owner: WorkspaceType;
  user: UserType;
  initialSelectedSkills: AgentBuilderSkillsType[];
  initialAdditionalSpaces: string[];
  alreadyRequestedSpaceIds: Set<string>;
  // Tool-related props
  addTools: (action: BuilderAction | BuilderAction[]) => void;
  onActionUpdate?: (action: BuilderAction, index: number) => void;
  selectedActions: BuilderAction[];
  getAgentInstructions: () => string;
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
}

export function SkillsSheet(props: SkillsSheetProps) {
  const { mode, onClose } = props;

  return (
    <MultiPageSheet
      open={mode !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {mode && <SkillsSheetContent {...props} mode={mode} />}
    </MultiPageSheet>
  );
}

function SkillsSheetContent({
  mode,
  onClose,
  onSave,
  onModeChange,
  owner,
  user,
  initialSelectedSkills,
  initialAdditionalSpaces,
  alreadyRequestedSpaceIds,
  addTools,
  onActionUpdate,
  selectedActions,
  getAgentInstructions,
  filterMCPServerViews,
}: SkillsSheetProps & { mode: SkillsSheetMode }) {
  const sendNotification = useSendNotification();
  const { mcpServerViewsWithKnowledge, mcpServerViewsWithoutKnowledge } =
    useMCPServerViewsContext();

  // Combine all labeled MCP server views for lookup
  const allLabeledMcpServerViews = useMemo(
    () => [...mcpServerViewsWithKnowledge, ...mcpServerViewsWithoutKnowledge],
    [mcpServerViewsWithKnowledge, mcpServerViewsWithoutKnowledge]
  );

  // Skills state
  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >(initialSelectedSkills);
  const [localAdditionalSpaces, setLocalAdditionalSpaces] = useState<string[]>(
    initialAdditionalSpaces
  );

  // Tools state
  const [selectedToolsInSheet, setSelectedToolsInSheet] = useState<
    SelectedTool[]
  >([]);
  const [capabilityFilter, setCapabilityFilter] =
    useState<CapabilityFilterType>("all");

  // Configuration tool for edit/configure modes
  const configurationTool = useMemo<BuilderAction | null>(() => {
    if (
      mode.type === SKILLS_SHEET_PAGE_IDS.CONFIGURATION ||
      mode.type === SKILLS_SHEET_PAGE_IDS.TOOL_EDIT
    ) {
      return mode.action;
    }
    return null;
  }, [mode]);

  // Get MCP server view for configuration
  const configurationMCPServerView =
    useMemo((): MCPServerViewTypeWithLabel | null => {
      if (mode.type === SKILLS_SHEET_PAGE_IDS.CONFIGURATION) {
        return mode.mcpServerView;
      }
      if (
        mode.type === SKILLS_SHEET_PAGE_IDS.TOOL_EDIT &&
        mode.action.configuration?.mcpServerViewId
      ) {
        return (
          allLabeledMcpServerViews.find(
            (v) => v.sId === mode.action.configuration?.mcpServerViewId
          ) ?? null
        );
      }
      return null;
    }, [mode, allLabeledMcpServerViews]);

  // Form schema (conditional on view)
  const formSchema = useMemo(
    () =>
      configurationMCPServerView
        ? getMCPConfigurationFormSchema(configurationMCPServerView)
        : null,
    [configurationMCPServerView]
  );

  // Default form values
  const defaultFormValues = useMemo<MCPFormData>(() => {
    if (configurationTool?.type === "MCP") {
      return {
        name: configurationTool.name ?? "",
        description: configurationTool.description ?? "",
        configuration: configurationTool.configuration,
      };
    }
    return getDefaultFormValues(configurationMCPServerView);
  }, [configurationTool, configurationMCPServerView]);

  // Form instance
  const form = useForm<MCPFormData>({
    resolver: formSchema ? zodResolver(formSchema) : undefined,
    mode: "onSubmit",
    defaultValues: defaultFormValues,
    shouldUnregister: false,
  });

  // Form reset on mode change
  const resetFormValues = useMemo(
    () =>
      createFormResetHandler(
        configurationTool,
        configurationMCPServerView,
        mode !== null
      ),
    [configurationTool, configurationMCPServerView, mode]
  );

  useEffect(() => {
    resetFormValues(form);
  }, [resetFormValues, form]);

  // Configuration save handler
  const handleConfigurationSave = useCallback(
    (formData: MCPFormData) => {
      if (!configurationTool || !configurationMCPServerView) {
        return;
      }

      // For new actions or when name changed, generate unique name
      const isEditMode = mode.type === SKILLS_SHEET_PAGE_IDS.TOOL_EDIT;
      const nameChanged = defaultFormValues.name !== formData.name;
      const shouldGenerateName = !isEditMode || nameChanged;

      const newActionName = shouldGenerateName
        ? generateUniqueActionName({
            baseName: nameToStorageFormat(formData.name),
            existingActions: selectedActions,
            selectedToolsInSheet,
          })
        : configurationTool.name;

      const configuredAction: BuilderAction = {
        ...configurationTool,
        name: newActionName,
        description: formData.description,
        configuration: formData.configuration,
      };

      if (mode.type === SKILLS_SHEET_PAGE_IDS.TOOL_EDIT && onActionUpdate) {
        onActionUpdate(configuredAction, mode.index);
        onClose();
        sendNotification({
          title: "Tool updated",
          description: "Configuration saved.",
          type: "success",
        });
      } else {
        // Add to selectedToolsInSheet
        setSelectedToolsInSheet((prev) => [
          ...prev,
          {
            type: "MCP",
            view: configurationMCPServerView,
            configuredAction,
          },
        ]);
        onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION });
      }
    },
    [
      configurationTool,
      configurationMCPServerView,
      mode,
      defaultFormValues,
      selectedActions,
      selectedToolsInSheet,
      onActionUpdate,
      onClose,
      sendNotification,
      onModeChange,
    ]
  );

  const handleSave = useCallback(() => {
    // Save skills
    onSave(localSelectedSkills, localAdditionalSpaces);

    // Save tools - add each selected tool as an action
    if (selectedToolsInSheet.length > 0) {
      const toolsToAdd = selectedToolsInSheet
        .filter((t) => t.type === "MCP")
        .map((t) => {
          if (t.configuredAction) {
            return t.configuredAction;
          }
          // Create default action for tools without configuration
          return getDefaultMCPAction(t.view);
        });

      if (toolsToAdd.length > 0) {
        addTools(toolsToAdd);
      }
    }

    onClose();
  }, [
    localSelectedSkills,
    localAdditionalSpaces,
    selectedToolsInSheet,
    onSave,
    addTools,
    onClose,
  ]);

  const { page, leftButton, rightButton } = getPageAndFooter({
    mode,
    onModeChange,
    onClose,
    handleSave,
    owner,
    user,
    alreadyRequestedSpaceIds,
    localSelectedSkills,
    setLocalSelectedSkills,
    localAdditionalSpaces,
    setLocalAdditionalSpaces,
    selectedToolsInSheet,
    setSelectedToolsInSheet,
    capabilityFilter,
    setCapabilityFilter,
    selectedActions,
    filterMCPServerViews,
    addTools,
    onActionUpdate,
    getAgentInstructions,
    // Form props for configuration pages
    form,
    handleConfigurationSave,
    configurationMCPServerView,
  });

  return (
    <MultiPageSheetContent
      pages={[page]}
      currentPageId={mode.type}
      onPageChange={() => {}}
      size="xl"
      addFooterSeparator
      showHeaderNavigation={false}
      showNavigation={false}
      leftButton={leftButton}
      rightButton={rightButton}
    />
  );
}
