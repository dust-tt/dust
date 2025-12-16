import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import React from "react";

import { useSkillSelection } from "@app/components/agent_builder/skills/skillSheet/hooks";
import { SelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SelectionPage";
import { SpaceSelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SpaceSelectionPage";
import type { PageContentProps } from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { SkillDetailsSheetContent } from "@app/components/skills/SkillDetailsSheet";
import { SKILL_ICON } from "@app/lib/skill";
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

  switch (mode.type) {
    case SKILLS_SHEET_PAGE_IDS.SELECTION:
      return {
        page: {
          title: "Add skills",
          id: mode.type,
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
        leftButton: getCancelButton(onClose),
        rightButton: {
          label: "Add skills",
          onClick: handleSave,
          variant: "primary",
        },
      };
    case SKILLS_SHEET_PAGE_IDS.INFO:
      return {
        page: {
          title: mode.skill.name,
          description: mode.skill.userFacingDescription,
          id: props.mode.type,
          icon: SKILL_ICON,
          content: (
            <SkillDetailsSheetContent
              skillConfiguration={mode.skill}
              owner={props.owner}
              user={props.user}
            />
          ),
        },
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () => onModeChange(mode.previousMode),
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
    default:
      assertNever(mode);
  }
}

export const getCancelButton = (onClose: () => void) => ({
  label: "Cancel",
  variant: "outline",
  onClick: onClose,
});
