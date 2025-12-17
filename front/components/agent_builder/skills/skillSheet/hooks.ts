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
import { useSkillConfigurationsWithRelations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { WhitelistableFeature } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

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

function isGlobalSkillWithSpaceSelection(skill: SkillType): boolean {
  return doesSkillTriggerSelectSpaces(skill.sId);
}

function getSelectionMode(mode: SkillsSheetMode): SelectionMode {
  if (mode.type === SKILLS_SHEET_PAGE_IDS.SELECTION) {
    return mode;
  }
  // For modes that have previousMode
  if ("previousMode" in mode) {
    return mode.previousMode;
  }
  // Default selection mode
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

  const {
    skillConfigurationsWithRelations,
    isSkillConfigurationsWithRelationsLoading,
  } = useSkillConfigurationsWithRelations({
    owner,
    status: "active",
  });

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return skillConfigurationsWithRelations;
    }
    const query = searchQuery.toLowerCase();
    return skillConfigurationsWithRelations.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.userFacingDescription.toLowerCase().includes(query)
    );
  }, [skillConfigurationsWithRelations, searchQuery]);

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
    isSkillsLoading: isSkillConfigurationsWithRelationsLoading,
    searchQuery,
    selectedSkillIds,
    setSearchQuery,
    handleSpaceSelectionSave,
    draftSelectedSpaces,
    setDraftSelectedSpaces,
  };
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
  selectedToolsInSheet,
  setSelectedToolsInSheet,
  onModeChange,
  searchQuery,
  filterMCPServerViews,
}: UseToolSelectionProps) => {
  const { owner } = useAgentBuilderContext();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const { mcpServerViewsWithoutKnowledge, isMCPServerViewsLoading } =
    useMCPServerViewsContext();

  // Filter out already selected actions and apply custom filter
  const shouldFilterServerView = useCallback(
    (view: MCPServerViewTypeWithLabel, actions: BuilderAction[]) => {
      // Check if already selected
      const selectedServerIds = new Set(
        actions
          .filter((a) => a.type === "MCP" && a.configuration?.mcpServerViewId)
          .map((a) => a.configuration!.mcpServerViewId)
      );
      const selectedView = selectedToolsInSheet.find(
        (t) => t.type === "MCP" && t.view.sId === view.sId
      );
      if (selectedView?.configuredAction || selectedServerIds.has(view.sId)) {
        return true;
      }
      // Apply custom filter
      if (filterMCPServerViews && !filterMCPServerViews(view)) {
        return true;
      }
      return false;
    },
    [selectedToolsInSheet, filterMCPServerViews]
  );

  const topMCPServerViews = useMemo(() => {
    const views = mcpServerViewsWithoutKnowledge.filter((view) =>
      TOP_MCP_SERVER_VIEWS.includes(view.sId)
    );
    return views.filter(
      (view) => !shouldFilterServerView(view, selectedActions)
    );
  }, [mcpServerViewsWithoutKnowledge, shouldFilterServerView, selectedActions]);

  const nonTopMCPServerViews = useMemo(() => {
    const views = mcpServerViewsWithoutKnowledge.filter(
      (view) => !TOP_MCP_SERVER_VIEWS.includes(view.sId)
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

  const toggleToolSelection = useCallback(
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
    topMCPServerViews: filteredViews.topViews,
    nonTopMCPServerViews: filteredViews.nonTopViews,
    isMCPServerViewsLoading,
    toggleToolSelection,
    onClickMCPServer,
    handleToolInfoClick,
    featureFlags: featureFlags as WhitelistableFeature[] | undefined,
  };
};
