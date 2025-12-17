import { useCallback, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  PageContentProps,
  SelectedTool,
  SelectionMode,
  SkillsSheetMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { doesSkillTriggerSelectSpaces } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const TOP_MCP_SERVER_VIEWS = [
  "web_search_&_browse",
  "image_generation",
  AGENT_MEMORY_SERVER_NAME,
  "deep_dive",
  "interactive_content",
  "slack",
  "gmail",
  "google_calendar",
];

/**
 * Hook for filtering and organizing MCP server views.
 * Shared between SkillsSheet and MCPServerViewsSheet.
 */
interface UseMCPServerViewsFilterProps {
  selectedActions: BuilderAction[];
  searchQuery: string;
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
}

export const useMCPServerViewsFilter = ({
  selectedActions,
  searchQuery,
  filterMCPServerViews,
}: UseMCPServerViewsFilterProps) => {
  const { mcpServerViewsWithoutKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  // Filter out already added actions and apply custom filter
  const shouldFilterServerView = useCallback(
    (view: MCPServerViewTypeWithLabel, actions: BuilderAction[]) => {
      const alreadyAddedServerIds = new Set(
        actions
          .filter(
            (a) =>
              a.type === "MCP" &&
              a.configuration?.mcpServerViewId &&
              !a.configurationRequired
          )
          .map((a) => a.configuration!.mcpServerViewId)
      );
      if (alreadyAddedServerIds.has(view.sId)) {
        return true;
      }
      return filterMCPServerViews ? !filterMCPServerViews(view) : false;
    },
    [filterMCPServerViews]
  );

  const topMCPServerViews = useMemo(() => {
    const views = mcpServerViewsWithoutKnowledge.filter((view) =>
      TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );
    return views.filter(
      (view) => !shouldFilterServerView(view, selectedActions)
    );
  }, [mcpServerViewsWithoutKnowledge, shouldFilterServerView, selectedActions]);

  const nonTopMCPServerViews = useMemo(() => {
    const views = mcpServerViewsWithoutKnowledge.filter(
      (view) => !TOP_MCP_SERVER_VIEWS.includes(view.server.name)
    );
    return views.filter(
      (view) => !shouldFilterServerView(view, selectedActions)
    );
  }, [mcpServerViewsWithoutKnowledge, shouldFilterServerView, selectedActions]);

  // Filter by search term
  const filteredViews = useMemo(() => {
    const filterViews = (views: MCPServerViewTypeWithLabel[]) => {
      if (!searchQuery.trim()) {
        return views;
      }
      const term = searchQuery.toLowerCase();
      return views.filter(
        (view) =>
          view.label.toLowerCase().includes(term) ||
          view.server.description?.toLowerCase().includes(term)
      );
    };
    return {
      topViews: filterViews(topMCPServerViews),
      nonTopViews: filterViews(nonTopMCPServerViews),
    };
  }, [searchQuery, topMCPServerViews, nonTopMCPServerViews]);

  return {
    topMCPServerViews: filteredViews.topViews,
    nonTopMCPServerViews: filteredViews.nonTopViews,
    isMCPServerViewsLoading,
  };
};

function isGlobalSkillWithSpaceSelection(skill: SkillType): boolean {
  return doesSkillTriggerSelectSpaces(skill.sId);
}

function getSelectionMode(mode: SkillsSheetMode): SelectionMode {
  if (mode.type === SKILLS_SHEET_PAGE_IDS.SELECTION) {
    return mode;
  }
  if ("previousMode" in mode) {
    return mode.previousMode;
  }
  // Fallback to selection mode for now, will be removed in a later PR
  return { type: SKILLS_SHEET_PAGE_IDS.SELECTION };
}

export const useSkillSelection = ({
  mode,
  onModeChange,
  localSelectedSkills,
  setLocalSelectedSkills,
  localAdditionalSpaces,
  setLocalAdditionalSpaces,
}: PageContentProps) => {
  const { owner } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");

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
    if (!searchQuery.trim()) {
      return skillsWithRelations;
    }
    const query = searchQuery.toLowerCase();
    return skillsWithRelations.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.userFacingDescription.toLowerCase().includes(query)
    );
  }, [skillsWithRelations, searchQuery]);

  const selectionMode = getSelectionMode(mode);

  const handleSkillToggle = useCallback(
    (skill: SkillType) => {
      const isAlreadySelected = localSelectedSkills.some(
        (s) => s.sId === skill.sId
      );

      if (isAlreadySelected) {
        setLocalSelectedSkills((prev) =>
          prev.filter((s) => s.sId !== skill.sId)
        );
      } else {
        if (isGlobalSkillWithSpaceSelection(skill)) {
          onModeChange({
            type: SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION,
            skillConfiguration: skill,
            previousMode: selectionMode,
          });
        } else {
          setLocalSelectedSkills((prev) => [
            ...prev,
            {
              sId: skill.sId,
              name: skill.name,
              description: skill.userFacingDescription,
            },
          ]);
        }
      }
    },
    [localSelectedSkills, selectionMode, onModeChange, setLocalSelectedSkills]
  );

  const handleSpaceSelectionSave = useCallback(
    (skill: SkillType) => {
      // Commit draft spaces to actual state
      setLocalAdditionalSpaces(draftSelectedSpaces);
      // Add the skill
      setLocalSelectedSkills((prev: AgentBuilderSkillsType[]) => [
        ...prev,
        {
          sId: skill.sId,
          name: skill.name,
          description: skill.userFacingDescription,
        },
      ]);
      onModeChange(selectionMode);
    },
    [
      selectionMode,
      onModeChange,
      setLocalSelectedSkills,
      setLocalAdditionalSpaces,
      draftSelectedSpaces,
    ]
  );

  return {
    handleSkillToggle,
    filteredSkills,
    isSkillsLoading: isSkillsWithRelationsLoading,
    searchQuery,
    selectedSkillIds,
    setSearchQuery,
    handleSpaceSelectionSave,
    draftSelectedSpaces,
    setDraftSelectedSpaces,
  };
};

/**
 * Hook for toggling tool selection in a sheet.
 * Shared between SkillsSheet and MCPServerViewsSheet.
 */
export const useToggleToolSelection = (
  setSelectedToolsInSheet: React.Dispatch<React.SetStateAction<SelectedTool[]>>
) => {
  return useCallback(
    (tool: SelectedTool) => {
      setSelectedToolsInSheet((prev) => {
        const isAlreadySelected = prev.some(
          (t) => t.type === "MCP" && t.view.sId === tool.view.sId
        );
        if (isAlreadySelected) {
          return prev.filter(
            (t) => !(t.type === "MCP" && t.view.sId === tool.view.sId)
          );
        }
        return [...prev, tool];
      });
    },
    [setSelectedToolsInSheet]
  );
};

interface UseToolSelectionProps {
  selectedActions: BuilderAction[];
  selectedToolsInSheet: SelectedTool[];
  setSelectedToolsInSheet: React.Dispatch<React.SetStateAction<SelectedTool[]>>;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  searchQuery: string;
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
}

export const useToolSelection = ({
  selectedActions,
  setSelectedToolsInSheet,
  onModeChange,
  searchQuery,
  filterMCPServerViews,
}: UseToolSelectionProps) => {
  const { owner } = useAgentBuilderContext();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const { topMCPServerViews, nonTopMCPServerViews, isMCPServerViewsLoading } =
    useMCPServerViewsFilter({
      selectedActions,
      searchQuery,
      filterMCPServerViews,
    });

  const toggleToolSelection = useToggleToolSelection(setSelectedToolsInSheet);

  const onClickMCPServer = useCallback(
    (mcpServerView: MCPServerViewTypeWithLabel) => {
      const tool: SelectedTool = { type: "MCP", view: mcpServerView };
      const requirements = getMCPServerRequirements(
        mcpServerView,
        featureFlags
      );

      if (requirements.noRequirement) {
        toggleToolSelection(tool);
      } else {
        // Navigate to configuration page
        const action = getDefaultMCPAction(mcpServerView);
        onModeChange({
          type: SKILLS_SHEET_PAGE_IDS.CONFIGURATION,
          action,
          mcpServerView,
        });
      }
    },
    [featureFlags, toggleToolSelection, onModeChange]
  );

  const handleToolInfoClick = useCallback(
    (view: MCPServerViewTypeWithLabel) => {
      const action = getDefaultMCPAction(view);
      onModeChange({
        type: SKILLS_SHEET_PAGE_IDS.TOOL_INFO,
        action,
        source: "toolDetails",
      });
    },
    [onModeChange]
  );

  return {
    topMCPServerViews,
    nonTopMCPServerViews,
    isMCPServerViewsLoading,
    toggleToolSelection,
    onClickMCPServer,
    handleToolInfoClick,
    featureFlags,
  };
};
