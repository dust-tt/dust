import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import React from "react";

import { useLocalSelectedSkills } from "@app/components/agent_builder/skills/skillSheet/hooks";
import { SelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SelectionPage";
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
  const mode = props.mode;
  switch (mode.type) {
    case SKILLS_SHEET_PAGE_IDS.SELECTION:
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { handleSave, ...restOfUtils } = useLocalSelectedSkills({
        mode,
        onSave: props.onSave,
        onClose: props.onClose,
      });

      return {
        page: {
          title: "Add skills",
          id: mode.type,
          content: (
            <SelectionPageContent {...props} {...restOfUtils} mode={mode} />
          ),
        },
        leftButton: getCancelButton(props.onClose),
        rightButton: {
          label: "Add skills",
          onClick: handleSave,
          variant: "primary",
        },
      };
    case SKILLS_SHEET_PAGE_IDS.INFO:
      return {
        page: {
          title: mode.skillConfiguration.name,
          description: mode.skillConfiguration.description,
          id: props.mode.type,
          icon: SKILL_ICON,
          content: (
            <SkillDetailsSheetContent
              skillConfiguration={mode.skillConfiguration}
              owner={props.owner}
              user={props.user}
            />
          ),
        },
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () => props.onModeChange(mode.previousMode),
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
