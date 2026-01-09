import { useCallback, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";

import type {
  AgentBuilderFormData,
  AgentBuilderSkillsType,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  generateUniqueActionName,
  nameToStorageFormat,
} from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import type { SelectedTool } from "@app/components/agent_builder/capabilities/shared/types";
import { TOP_MCP_SERVER_VIEWS } from "@app/components/agent_builder/capabilities/shared/types";
import type {
  ConfigurationState,
  SheetState,
} from "@app/components/agent_builder/skills/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { doesSkillTriggerSelectSpaces } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";

function isGlobalSkillWithSpaceSelection(skill: SkillType): boolean {
  return doesSkillTriggerSelectSpaces(skill.sId);
}

export const useSkillSpaceSelection = () => {
  const agentBuilderFormAdditionalSpaces = useWatch<
    AgentBuilderFormData,
    "additionalSpaces"
  >({
    name: "additionalSpaces",
  });

  const [localSelectedSpaces, setLocalSelectedSpaces] = useState<string[]>([]);

  const resetLocalState = useCallback(() => {
    setLocalSelectedSpaces(agentBuilderFormAdditionalSpaces);
  }, [agentBuilderFormAdditionalSpaces]);

  useEffect(() => {
    // When agent builder form spaces change, make sure local state is updated
    resetLocalState();
  }, [agentBuilderFormAdditionalSpaces, resetLocalState]);

  return {
    localSelectedSpaces,
    setLocalSelectedSpaces,
    resetLocalState,
  };
};

type UseSkillSelectionProps = {
  onStateChange: (state: SheetState) => void;
  alreadyAddedSkillIds: Set<string>;
  searchQuery: string;
};

export const useSkillSelection = ({
  onStateChange,
  alreadyAddedSkillIds,
  searchQuery,
}: UseSkillSelectionProps) => {
  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >([]);

  const resetLocalState = useCallback(() => {
    setLocalSelectedSkills([]);
  }, []);

  const { skills, isSkillsLoading } = useSkillsContext();

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    const notAlreadyAddedSkills = skills.filter(
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
  }, [skills, searchQuery, alreadyAddedSkillIds]);

  const unselectSkill = useCallback((skill: AgentBuilderSkillsType) => {
    setLocalSelectedSkills((prev) =>
      prev.filter((selected) => skill.sId !== selected.sId)
    );
  }, []);

  const handleSkillToggle = useCallback(
    (skill: SkillType) => {
      if (selectedSkillIds.has(skill.sId)) {
        setLocalSelectedSkills((prev) =>
          prev.filter((s) => s.sId !== skill.sId)
        );
        return;
      }

      if (isGlobalSkillWithSpaceSelection(skill)) {
        onStateChange({
          state: "space-selection",
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
    [selectedSkillIds, onStateChange, setLocalSelectedSkills]
  );

  const handleSpaceSelectionSave = useCallback(
    (skill: SkillType) => {
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
      onStateChange({ state: "selection" });
    },
    [onStateChange, setLocalSelectedSkills]
  );

  return {
    localSelectedSkills,
    unselectSkill,
    handleSkillToggle,
    filteredSkills,
    isSkillsLoading,
    selectedSkillIds,
    handleSpaceSelectionSave,
    resetLocalState,
  };
};

export const useToolSelection = ({
  selectedActions,
  onStateChange,
  searchQuery,
}: {
  selectedActions: BuilderAction[];
  onStateChange: (state: SheetState) => void;
  searchQuery: string;
}) => {
  const [localSelectedTools, setLocalSelectedTools] = useState<SelectedTool[]>(
    []
  );

  const resetLocalState = useCallback(() => {
    setLocalSelectedTools([]);
  }, []);

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

    const topViews = mcpServerViewsWithoutKnowledge.filter((view) =>
      TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );
    const nonTopViews = mcpServerViewsWithoutKnowledge.filter(
      (view) => !TOP_MCP_SERVER_VIEWS.includes(view.server.name)
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

  const unselectTool = useCallback((tool: SelectedTool) => {
    setLocalSelectedTools((prev) =>
      prev.filter((selected) => tool.view.sId !== selected.view.sId)
    );
  }, []);

  const handleToolToggle = useCallback(
    (mcpServerView: MCPServerViewTypeWithLabel) => {
      const tool = { view: mcpServerView } satisfies SelectedTool;
      const requirements = getMCPServerRequirements(mcpServerView);

      if (!requirements.noRequirement) {
        const action = getDefaultMCPAction(mcpServerView);

        onStateChange({
          state: "configuration",
          capability: action,
          mcpServerView,
          index: null,
        });
        return;
      }

      // No configuration required, add to selected tools
      setLocalSelectedTools((prev) => {
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
    },
    [onStateChange]
  );

  const handleToolInfoClick = useCallback(
    (mcpServerView: MCPServerViewType) => {
      const action = getDefaultMCPAction(mcpServerView);
      onStateChange({
        state: "info",
        kind: "tool",
        capability: action,
        hasPreviousPage: true,
      });
    },
    [onStateChange]
  );

  const handleToolConfigurationSave = useCallback(
    (configState: ConfigurationState) => (formData: MCPFormData) => {
      const newActionName = generateUniqueActionName({
        baseName: nameToStorageFormat(formData.name),
        existingActions: selectedActions,
        selectedToolsInSheet: localSelectedTools,
      });

      const configuredAction: BuilderAction = {
        ...configState.capability,
        name: newActionName,
        description: formData.description,
        configuration: formData.configuration,
      };

      const updatedTool: SelectedTool = {
        view: configState.mcpServerView,
        configuredAction,
      };

      setLocalSelectedTools((prev) => {
        const existingToolIndex = prev.findIndex(
          (tool) => tool.configuredAction?.name === configuredAction.name
        );

        if (existingToolIndex !== -1) {
          const updated = [...prev];
          updated[existingToolIndex] = updatedTool;
          return updated;
        } else {
          return [...prev, updatedTool];
        }
      });

      onStateChange({ state: "selection" });
    },
    [selectedActions, localSelectedTools, onStateChange]
  );

  return {
    localSelectedTools,
    unselectTool,
    handleToolToggle,
    handleToolInfoClick,
    filteredMCPServerViews,
    isMCPServerViewsLoading,
    selectedMCPServerViewIds,
    allMcpServerViews,
    handleToolConfigurationSave,
    resetLocalState,
  };
};
