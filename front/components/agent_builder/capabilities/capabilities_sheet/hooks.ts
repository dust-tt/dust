import { useCallback, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderSkillsType,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  CapabilitiesSheetMode,
  SelectedTool,
} from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { TOP_MCP_SERVER_VIEWS } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import {
  generateUniqueActionName,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { useBuilderContext } from "@app/components/shared/useBuilderContext";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { doesSkillTriggerSelectSpaces } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SkillType } from "@app/types/assistant/skill_configuration";

function isGlobalSkillWithSpaceSelection(skill: SkillType): boolean {
  return doesSkillTriggerSelectSpaces(skill.sId);
}

type UseSkillSelectionProps = {
  onModeChange: (mode: CapabilitiesSheetMode | null) => void;
  alreadyAddedSkillIds: Set<string>;
  initialAdditionalSpaces: string[];
  searchQuery: string;
};
export const useSkillSelection = ({
  onModeChange,
  alreadyAddedSkillIds,
  initialAdditionalSpaces,
  searchQuery,
}: UseSkillSelectionProps) => {
  const { owner } = useAgentBuilderContext();

  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >([]);
  const [localAdditionalSpaces, setLocalAdditionalSpaces] = useState<string[]>(
    initialAdditionalSpaces
  );

  // Draft state for space selection (only committed on save)
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>(
    localAdditionalSpaces
  );

  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({
      owner,
      status: "active",
    });

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    const notAlreadyAddedSkills = skillsWithRelations.filter(
      (skill) => !alreadyAddedSkillIds.has(skill.sId)
    );

    if (!searchQuery.trim()) {
      return notAlreadyAddedSkills;
    }
    const query = searchQuery.toLowerCase();
    return notAlreadyAddedSkills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.userFacingDescription.toLowerCase().includes(query)
    );
  }, [skillsWithRelations, searchQuery, alreadyAddedSkillIds]);

  const handleSkillToggle = useCallback(
    (skill: SkillType) => {
      if (selectedSkillIds.has(skill.sId)) {
        setLocalSelectedSkills((prev) =>
          prev.filter((s) => s.sId !== skill.sId)
        );
        return;
      }

      if (isGlobalSkillWithSpaceSelection(skill)) {
        onModeChange({
          pageId: "skill_space_selection",
          capability: skill,
        });
        return;
      }

      setLocalSelectedSkills((prev) => [
        ...prev,
        {
          sId: skill.sId,
          name: skill.name,
          description: skill.userFacingDescription,
          icon: skill.icon,
        },
      ]);
    },
    [selectedSkillIds, onModeChange, setLocalSelectedSkills]
  );

  const handleSpaceSelectionSave = useCallback(
    (skill: SkillType) => {
      // Commit draft spaces to actual state
      setLocalAdditionalSpaces(draftSelectedSpaces);
      // Add the skill
      setLocalSelectedSkills((prev) => [
        ...prev,
        {
          sId: skill.sId,
          name: skill.name,
          description: skill.userFacingDescription,
          icon: skill.icon,
        },
      ]);
      onModeChange({ pageId: "selection" });
    },
    [
      onModeChange,
      setLocalSelectedSkills,
      setLocalAdditionalSpaces,
      draftSelectedSpaces,
    ]
  );

  return {
    localSelectedSkills,
    localAdditionalSpaces,
    handleSkillToggle,
    filteredSkills,
    isSkillsLoading: isSkillsWithRelationsLoading,
    selectedSkillIds,
    handleSpaceSelectionSave,
    draftSelectedSpaces,
    setDraftSelectedSpaces,
  };
};

export const useToolSelection = ({
  selectedActions,
  onModeChange,
  searchQuery,
}: {
  selectedActions: BuilderAction[];
  onModeChange: (mode: CapabilitiesSheetMode | null) => void;
  searchQuery: string;
}) => {
  const { owner } = useBuilderContext();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const [localSelectedTools, setLocalSelectedTools] = useState<SelectedTool[]>(
    []
  );
  const [localMCPServerViewToConfigure, setLocalMCPServerViewToConfigure] =
    useState<MCPServerViewTypeWithLabel | null>(null);
  const [localActionToConfigure, setLocalActionToConfigure] =
    useState<BuilderAction | null>(null);

  const selectedMCPServerViewIds = useMemo(() => {
    return new Set(localSelectedTools.map((t) => t.view.sId));
  }, [localSelectedTools]);

  const {
    mcpServerViews: allMcpServerViews,
    mcpServerViewsWithoutKnowledge,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

  const isSelectedMCPServerView = useCallback(
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

  const filteredMCPServerViews = useMemo(() => {
    const filterViews = (views: MCPServerViewTypeWithLabel[]) =>
      views
        .filter((view) => !isSelectedMCPServerView(view, selectedActions))
        .filter((view) => {
          if (!searchQuery.trim()) {
            return true;
          }
          const term = searchQuery.toLowerCase();
          return [view.label, view.server.description, view.server.name].some(
            (field) => field?.toLowerCase().includes(term)
          );
        });

    const topViews = mcpServerViewsWithoutKnowledge.filter(
      (view) => !TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );
    const nonTopViews = mcpServerViewsWithoutKnowledge.filter((view) =>
      TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );

    return {
      topViews: filterViews(topViews),
      nonTopViews: filterViews(nonTopViews),
    };
  }, [
    searchQuery,
    mcpServerViewsWithoutKnowledge,
    selectedActions,
    isSelectedMCPServerView,
  ]);

  const handleToolToggle = useCallback(
    (mcpServerView: MCPServerViewTypeWithLabel) => {
      const tool = { type: "MCP", view: mcpServerView } satisfies SelectedTool;
      const requirements = getMCPServerRequirements(
        mcpServerView,
        featureFlags
      );

      if (!requirements.noRequirement) {
        const action = getDefaultMCPAction(mcpServerView);

        setLocalMCPServerViewToConfigure(mcpServerView);
        setLocalActionToConfigure(action);
        onModeChange({
          pageId: "tool_configuration",
          capability: action,
          mcpServerView,
        });
        return;
      }

      // No configuration required, add to selected tools
      setLocalSelectedTools((prev) => {
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
    },
    [featureFlags, onModeChange]
  );

  const handleToolInfoClick = useCallback(
    (mcpServerView: MCPServerViewType) => {
      const action = getDefaultMCPAction(mcpServerView);
      onModeChange({
        pageId: "tool_info",
        capability: action,
        hasPreviousPage: true,
      });
    },
    [onModeChange]
  );

  const handleMCPServerConfigurationSave = useCallback(
    (formData: MCPFormData) => {
      if (!localMCPServerViewToConfigure || !localActionToConfigure) {
        return;
      }

      const newActionName = generateUniqueActionName({
        baseName: nameToStorageFormat(formData.name),
        existingActions: selectedActions,
        selectedToolsInSheet: localSelectedTools,
      });

      const configuredAction: BuilderAction = {
        ...localActionToConfigure,
        name: newActionName,
        description: formData.description,
        configuration: formData.configuration,
      };

      const updatedTool: SelectedTool = {
        type: "MCP",
        view: localMCPServerViewToConfigure,
        configuredAction,
      };

      setLocalSelectedTools((prev) => {
        const existingToolIndex = prev.findIndex(
          (tool) =>
            tool.type === "MCP" &&
            tool.configuredAction?.name === configuredAction.name
        );

        if (existingToolIndex !== -1) {
          const updated = [...prev];
          updated[existingToolIndex] = updatedTool;
          return updated;
        } else {
          return [...prev, updatedTool];
        }
      });

      onModeChange({ pageId: "selection" });
    },
    [
      selectedActions,
      localSelectedTools,
      onModeChange,
      localMCPServerViewToConfigure,
      localActionToConfigure,
    ]
  );

  return {
    localSelectedTools,
    handleToolToggle,
    handleToolInfoClick,
    filteredMCPServerViews,
    isMCPServerViewsLoading,
    selectedMCPServerViewIds,
    allMcpServerViews,
    localMCPServerViewToConfigure,
    localActionToConfigure,
    handleMCPServerConfigurationSave,
  };
};
