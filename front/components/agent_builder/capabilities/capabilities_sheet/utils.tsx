import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import React from "react";

import { SelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/CapabilitiesSelectionPage";
import { useSkillSelection } from "@app/components/agent_builder/capabilities/capabilities_sheet/hooks";
import { SkillWithRelationsDetailsSheetContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SkillWithRelationsDetailsSheetContent";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/capabilities/capabilities_sheet/SpaceSelectionPage";
import type { PageContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { getSkillIcon } from "@app/lib/skill";
import { assertNever } from "@app/types";

export function getPageAndFooter(props: PageContentProps): {
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
  } = props;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const skillSelection = useSkillSelection(props);

  switch (mode.pageId) {
    case "selection":
      return {
        page: {
          title: "Add capabilities",
          id: mode.pageId,
          content: (
            <SelectionPageContent
              {...props}
              mode={mode}
              handleSkillToggle={skillSelection.handleSkillToggle}
              filteredSkills={skillSelection.filteredSkills}
              isSkillsLoading={skillSelection.isSkillsLoading}
              searchQuery={skillSelection.searchQuery}
              selectedSkillIds={skillSelection.selectedSkillIds}
              setSearchQuery={skillSelection.setSearchQuery}
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
            skillSelection.selectedSkillIds.size > 0
              ? "Add capabilities"
              : "Add capability",
          onClick: handleSave,
          variant: "primary",
        },
      };
    case "skill_info":
      return {
        page: {
          title: mode.capability.name,
          description: mode.capability.userFacingDescription,
          id: props.mode.pageId,
          icon: getSkillIcon(mode.capability.icon),
          content: (
            <SkillWithRelationsDetailsSheetContent
              skill={mode.capability}
              owner={props.owner}
              user={props.user}
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
            skillSelection.setDraftSelectedSpaces(localAdditionalSpaces);
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
