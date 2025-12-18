import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";

import { CapabilitiesSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSelectionPage";
import {
  useSkillSelection,
  useToolSelection,
} from "@app/components/agent_builder/capabilities/capabilities_sheet/hooks";
import { SkillWithRelationsDetailsSheetContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SkillWithRelationsDetailsSheetContent";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import type { CapabilitiesSheetContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { getSkillIcon } from "@app/lib/skill";
import { assertNever } from "@app/types";

export function useCapabilitiesPageAndFooter({
  owner,
  user,
  mode,
  onModeChange,
  onClose,
  onSave,
  alreadyRequestedSpaceIds,
  alreadyAddedSkillIds,
  initialAdditionalSpaces,
  selectedActions,
}: CapabilitiesSheetContentProps): {
  page: MultiPageSheetPage;
  leftButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
  rightButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
} {
  const [searchQuery, setSearchQuery] = useState("");

  const skillSelection = useSkillSelection({
    onModeChange,
    alreadyAddedSkillIds,
    initialAdditionalSpaces,
    searchQuery,
  });
  const toolSelection = useToolSelection({
    selectedActions,
    onModeChange,
    searchQuery,
  });

  const handleSave = useCallback(() => {
    onSave({
      skills: skillSelection.localSelectedSkills,
      additionalSpaces: skillSelection.localAdditionalSpaces,
      tools: toolSelection.localSelectedTools,
    });
    onClose();
  }, [skillSelection, toolSelection, onSave, onClose]);

  const selectedCapabilitiesCount = useMemo(() => {
    return (
      skillSelection.selectedSkillIds.size +
      toolSelection.selectedMCPServerViewIds.size
    );
  }, [skillSelection, toolSelection]);

  switch (mode.pageId) {
    case "selection":
      return {
        page: {
          title: "Add capabilities",
          id: mode.pageId,
          content: (
            <CapabilitiesSelectionPageContent
              owner={owner}
              isCapabilitiesLoading={
                skillSelection.isSkillsLoading ||
                toolSelection.isMCPServerViewsLoading
              }
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              {...skillSelection}
              {...toolSelection}
            />
          ),
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        },
        rightButton: {
          label:
            selectedCapabilitiesCount > 0
              ? `Add ${selectedCapabilitiesCount} ${selectedCapabilitiesCount === 1 ? "capability" : "capabilities"}`
              : "Add capabilities",
          disabled: selectedCapabilitiesCount === 0,
          onClick: handleSave,
          variant: "primary",
        },
      };
    case "skill_info":
      return {
        page: {
          title: mode.capability.name,
          description: mode.capability.userFacingDescription,
          id: mode.pageId,
          icon: getSkillIcon(mode.capability.icon),
          content: (
            <SkillWithRelationsDetailsSheetContent
              skill={mode.capability}
              owner={owner}
              user={user}
            />
          ),
        },
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () => {
            onModeChange({ pageId: "selection" });
          },
        },
      };
    case "skill_space_selection":
      return {
        page: {
          title: `Select spaces`,
          description:
            "Automatically grant access to all knowledge sources discovery from your selected spaces",
          id: mode.pageId,
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
            skillSelection.setDraftSelectedSpaces(
              skillSelection.localAdditionalSpaces
            );
            onModeChange({ pageId: "selection" });
          },
        },
        rightButton: {
          label: "Save",
          variant: "primary",
          onClick: () =>
            skillSelection.handleSpaceSelectionSave(mode.capability),
        },
      };
    // TODO(skills 2025-12-18): placeholder to satisfy type for now, will be implemented in future PRs
    case "tool_info":
    case "tool_configuration":
    case "tool_edit":
      return {
        page: {
          title: "Tool",
          id: mode.pageId,
          content: <div>Tool configuration coming soon</div>,
        },
        leftButton: {
          label: "Cancel",
          variant: "outline",
          onClick: () => {
            onModeChange({ pageId: "selection" });
          },
        },
      };
    default:
      assertNever(mode);
  }
}
