import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  CapabilityFilterType,
  SelectedTool,
  SkillsSheetMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/skills/skillSheet/utils";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
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
