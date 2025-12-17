import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import React from "react";

import { MCPServerInfoPage } from "@app/components/agent_builder/capabilities/mcp/MCPServerInfoPage";
import {
  useSkillSelection,
  useToolSelection,
} from "@app/components/agent_builder/skills/skillSheet/hooks";
import { SelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SelectionPage";
import { SkillWithRelationsDetailsSheetContent } from "@app/components/agent_builder/skills/skillSheet/SkillWithRelationsDetailsSheetContent";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SpaceSelectionPage";
import type {
  CapabilityFilterType,
  PageContentProps,
  SelectedTool,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { SKILL_ICON } from "@app/lib/skill";
import { assertNever } from "@app/types";

export type ExtendedPageContentProps = PageContentProps & {
  capabilityFilter: CapabilityFilterType;
  setCapabilityFilter: React.Dispatch<
    React.SetStateAction<CapabilityFilterType>
  >;
  selectedActions: BuilderAction[];
  filterMCPServerViews?: (view: MCPServerViewTypeWithLabel) => boolean;
  addTools: (action: BuilderAction | BuilderAction[]) => void;
  onActionUpdate?: (action: BuilderAction, index: number) => void;
  getAgentInstructions: () => string;
};

export function getPageAndFooter(props: ExtendedPageContentProps): {
  page: MultiPageSheetPage;
  leftButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
  rightButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
} {
  const {
    mode,
    onModeChange,
    onClose,
    handleSave,
    alreadyRequestedSpaceIds,
    localAdditionalSpaces,
    selectedToolsInSheet,
    setSelectedToolsInSheet,
    capabilityFilter,
    setCapabilityFilter,
    selectedActions,
    filterMCPServerViews,
  } = props;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const skillSelection = useSkillSelection(props);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const toolSelection = useToolSelection({
    selectedActions,
    selectedToolsInSheet,
    setSelectedToolsInSheet,
    onModeChange,
    searchQuery: skillSelection.searchQuery,
    filterMCPServerViews,
  });

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { mcpServerViews } = useMCPServerViewsContext();

  const totalSelected =
    props.localSelectedSkills.length + selectedToolsInSheet.length;

  switch (mode.type) {
    case SKILLS_SHEET_PAGE_IDS.SELECTION:
      return {
        page: {
          title: "Add capabilities",
          id: mode.type,
          content: (
            <SelectionPageContent
              {...props}
              mode={mode}
              // Skills props
              handleSkillToggle={skillSelection.handleSkillToggle}
              filteredSkills={skillSelection.filteredSkills}
              isSkillsLoading={skillSelection.isSkillsLoading}
              searchQuery={skillSelection.searchQuery}
              selectedSkillIds={skillSelection.selectedSkillIds}
              setSearchQuery={skillSelection.setSearchQuery}
              // Tools props
              topMCPServerViews={toolSelection.topMCPServerViews}
              nonTopMCPServerViews={toolSelection.nonTopMCPServerViews}
              onToolClick={toolSelection.onClickMCPServer}
              onToolDetailsClick={toolSelection.handleToolInfoClick}
              isMCPServerViewsLoading={toolSelection.isMCPServerViewsLoading}
              featureFlags={toolSelection.featureFlags}
              // Filter props
              filter={capabilityFilter}
              onFilterChange={setCapabilityFilter}
            />
          ),
        },
        leftButton: getCancelButton(onClose),
        rightButton: {
          label:
            totalSelected > 0
              ? `Add ${totalSelected} ${totalSelected === 1 ? "capability" : "capabilities"}`
              : "Add capabilities",
          onClick: handleSave,
          variant: "primary",
          disabled: totalSelected === 0,
        },
      };

    case SKILLS_SHEET_PAGE_IDS.SKILL_INFO:
      return {
        page: {
          title: mode.skill.name,
          description: mode.skill.userFacingDescription,
          id: mode.type,
          icon: SKILL_ICON,
          content: (
            <SkillWithRelationsDetailsSheetContent
              skill={mode.skill}
              owner={props.owner}
              user={props.user}
            />
          ),
        },
        leftButton:
          mode.source === "skillDetails"
            ? {
                label: "Back",
                variant: "outline",
                onClick: () =>
                  onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION }),
              }
            : {
                label: "Close",
                variant: "outline",
                onClick: onClose,
              },
      };

    case SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION:
      return {
        page: {
          title: `Select spaces`,
          description:
            "Automatically grant access to all knowledge sources discovery from your selected spaces",
          id: mode.type,
          content: (
            <SpaceSelectionPageContent
              alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
              draftSelectedSpaces={skillSelection.draftSelectedSpaces}
              setDraftSelectedSpaces={skillSelection.setDraftSelectedSpaces}
            />
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: () => {
            skillSelection.setDraftSelectedSpaces(localAdditionalSpaces);
            onModeChange(mode.previousMode);
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: () =>
            skillSelection.handleSpaceSelectionSave(mode.skillConfiguration),
        },
      };

    case SKILLS_SHEET_PAGE_IDS.TOOL_INFO: {
      // Find the MCP server view for this action by matching the configuration
      const mcpServerView = mcpServerViews.find(
        (v) =>
          v.sId === mode.action.configuration?.mcpServerViewId ||
          v.name === mode.action.name
      );
      return {
        page: {
          title: mode.action.name,
          description: mode.action.description ?? "",
          id: mode.type,
          content: mcpServerView ? (
            <MCPServerInfoPage infoMCPServerView={mcpServerView} />
          ) : (
            <div className="p-4 text-muted-foreground">
              Tool information not available.
            </div>
          ),
        },
        leftButton:
          mode.source === "toolDetails"
            ? {
                label: "Back",
                variant: "outline",
                onClick: () =>
                  onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION }),
              }
            : {
                label: "Close",
                variant: "outline",
                onClick: onClose,
              },
      };
    }

    case SKILLS_SHEET_PAGE_IDS.CONFIGURATION:
      // TODO: Implement full configuration page
      // For now, return a placeholder - configuration will be implemented in Phase 7
      return {
        page: {
          title: `Configure ${mode.mcpServerView.label}`,
          id: mode.type,
          content: (
            <div className="p-4">
              <p className="text-muted-foreground">
                Configuration page coming soon...
              </p>
            </div>
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: () =>
            onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION }),
        },
        rightButton: {
          label: "Add tool",
          variant: "primary",
          onClick: () => {
            // Add tool with proper default config
            const defaultAction = getDefaultMCPAction(mode.mcpServerView);
            const tool: SelectedTool = {
              type: "MCP",
              view: mode.mcpServerView,
              configuredAction: defaultAction,
            };
            setSelectedToolsInSheet((prev) => [...prev, tool]);
            onModeChange({ type: SKILLS_SHEET_PAGE_IDS.SELECTION });
          },
        },
      };

    case SKILLS_SHEET_PAGE_IDS.TOOL_EDIT:
      // TODO: Implement edit page (similar to configuration but for existing tools)
      return {
        page: {
          title: `Edit ${mode.action.name}`,
          id: mode.type,
          content: (
            <div className="p-4">
              <p className="text-muted-foreground">Edit page coming soon...</p>
            </div>
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: onClose,
        },
      };

    default:
      assertNever(mode);
  }
}

export const getCancelButton = (
  onClose: () => void
): ButtonProps & React.RefAttributes<HTMLButtonElement> => ({
  label: "Cancel",
  variant: "outline",
  onClick: onClose,
});
