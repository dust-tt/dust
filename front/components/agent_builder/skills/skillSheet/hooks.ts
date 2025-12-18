import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  PageContentProps,
  SelectionMode,
  SkillsSheetMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { useBuilderContext } from "@app/components/shared/useBuilderContext";
import { AGENT_MEMORY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { doesSkillTriggerSelectSpaces } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SkillType } from "@app/types/assistant/skill_configuration";

function isGlobalSkillWithSpaceSelection(skill: SkillType): boolean {
  return doesSkillTriggerSelectSpaces(skill.sId);
}

function getSelectionMode(mode: SkillsSheetMode): SelectionMode {
  if (
    mode.type === SKILLS_SHEET_PAGE_IDS.INFO ||
    mode.type === SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION
  ) {
    return mode.previousMode;
  }

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
              icon: skill.icon,
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
          icon: skill.icon,
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

// TODO(skills 2025-12-18): duplicated from MCPServerViewsSheet, to cleanup later
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
type SelectedTool = {
  type: "MCP";
  view: MCPServerViewTypeWithLabel;
  configuredAction?: BuilderAction;
};

export const useToolSelection = ({
  selectedActions,
  setSelectedToolsInSheet,
  onModeChange,
  searchTerm,
  filterMCPServerViews,
}: {
  selectedActions: BuilderAction[];
  setSelectedToolsInSheet: Dispatch<SetStateAction<SelectedTool[]>>;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  searchTerm: string;
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
}) => {
  const { owner } = useBuilderContext();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const {
    mcpServerViews: allMcpServerViews,
    mcpServerViewsWithoutKnowledge,
    isMCPServerViewsLoading,
  } = useMCPServerViewsContext();

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

  const toggleToolSelection = useCallback(
    (tool: SelectedTool) => {
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
    },
    [setSelectedToolsInSheet]
  );

  const onClickMCPServer = useCallback(
    (mcpServerView: MCPServerViewTypeWithLabel) => {
      const tool = { type: "MCP", view: mcpServerView } satisfies SelectedTool;
      const requirements = getMCPServerRequirements(
        mcpServerView,
        featureFlags
      );

      if (!requirements.noRequirement) {
        const action = getDefaultMCPAction(mcpServerView);

        onModeChange({
          type: SKILLS_SHEET_PAGE_IDS.TOOL_CONFIGURATION,
          action,
          mcpServerView,
        });
        return;
      }

      // No configuration required, add to selected tools
      toggleToolSelection(tool);
    },
    [featureFlags, toggleToolSelection, onModeChange]
  );

  const handleToolInfoClick = useCallback(
    (mcpServerView: MCPServerViewType) => {
      const action = getDefaultMCPAction(mcpServerView);
      onModeChange({
        type: SKILLS_SHEET_PAGE_IDS.TOOL_INFO,
        action,
        source: "toolDetails",
      });
    },
    [onModeChange]
  );

  return {
    filteredViews,
    isMCPServerViewsLoading,
    toggleToolSelection,
    onClickMCPServer,
    handleToolInfoClick,
    featureFlags,
  };
};
