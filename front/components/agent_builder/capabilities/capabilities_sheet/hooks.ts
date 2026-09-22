import type {
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
import { useSendNotification } from "@app/hooks/useNotification";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  useSearchSkills,
  useSkillWithRelations,
} from "@app/lib/swr/skill_configurations";
import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";

type UseSkillSelectionProps = {
  owner: LightWorkspaceType;
  disabled: boolean;
  alreadyAddedSkillIds: Set<string>;
  searchQuery: string;
};

export const useSkillSelection = ({
  owner,
  disabled,
  alreadyAddedSkillIds,
  searchQuery,
}: UseSkillSelectionProps) => {
  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >([]);

  const resetLocalState = useCallback(() => {
    setLocalSelectedSkills([]);
  }, []);

  const { skills, isSkillsLoading: isListedSkillsLoading } = useSkillsContext();
  const { hasFeature } = useFeatureFlags();
  const useSkillSearch = hasFeature("skills_search");
  const sendNotification = useSendNotification();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const {
    skills: searchSkills,
    resolvedSearchTerm,
    isSkillsLoading: isSearchSkillsLoading,
    hasMore,
    nextCursor,
  } = useSearchSkills({
    owner,
    searchTerm: searchQuery,
    cursor: cursors.at(-1),
    disabled: disabled || !useSkillSearch,
  });

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    if (useSkillSearch) {
      return searchSkills.filter(
        (skill) => !alreadyAddedSkillIds.has(skill.sId)
      );
    }

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
  }, [skills, searchSkills, useSkillSearch, searchQuery, alreadyAddedSkillIds]);

  const unselectSkill = useCallback((skill: AgentBuilderSkillsType) => {
    setLocalSelectedSkills((prev) =>
      prev.filter((selected) => skill.sId !== selected.sId)
    );
  }, []);

  const addSkill = useCallback(
    (skill: SkillWithoutInstructionsAndToolsType) => {
      setLocalSelectedSkills((prev) => [
        ...prev.filter((selected) => selected.sId !== skill.sId),
        {
          sId: skill.sId,
          name: skill.name,
          description: skill.userFacingDescription,
          icon: skill.icon,
          availability: skill.availability,
          canWrite: skill.canWrite,
        },
      ]);
    },
    []
  );
  const { fetchSkillWithRelations, isLoading: isSelectingSkill } =
    useSkillWithRelations(owner, {
      onSuccess: ({ skill }) => {
        if (!disabled) {
          addSkill(skill);
        }
      },
      onError: () =>
        sendNotification({
          type: "error",
          title: "Could not load skill",
          description: "Please try again.",
        }),
    });

  const handleSkillToggle = (skillId: string) => {
    if (isSelectingSkill) {
      return;
    }
    if (selectedSkillIds.has(skillId)) {
      setLocalSelectedSkills((previous) =>
        previous.filter((skill) => skill.sId !== skillId)
      );
    } else if (useSkillSearch) {
      // The form needs the skill's current edit permission, not just listing metadata.
      void fetchSkillWithRelations(skillId, { throwOnError: false });
    } else {
      const skill = skills.find((skill) => skill.sId === skillId);
      if (skill) {
        addSkill(skill);
      }
    }
  };

  const resetSearchPagination = () => setCursors([null]);

  return {
    localSelectedSkills,
    unselectSkill,
    handleSkillToggle,
    filteredSkills,
    isSkillsLoading: useSkillSearch
      ? isSearchSkillsLoading
      : isListedSkillsLoading,
    isSelectingSkill,
    resolvedSearchQuery: useSkillSearch
      ? (resolvedSearchTerm ?? "")
      : searchQuery,
    resetSearchPagination,
    skillPagination: useSkillSearch
      ? {
          hasPrevious: cursors.length > 1,
          hasMore,
          previous: () => setCursors((previous) => previous.slice(0, -1)),
          next: () => setCursors((previous) => [...previous, nextCursor]),
        }
      : null,
    selectedSkillIds,
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
