import type { ButtonProps, MultiPageSheetPage } from "@dust-tt/sparkle";
import React from "react";

import { SelectionPageContent } from "@app/components/agent_builder/skills/skillSheet/SelectionContent";
import type { PageContentProps } from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { assertNever } from "@app/types";

export function getPageAndFooter(props: PageContentProps): {
  page: MultiPageSheetPage;
  leftButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
  rightButton?: ButtonProps & React.RefAttributes<HTMLButtonElement>;
} {
  switch (props.mode.type) {
    case SKILLS_SHEET_PAGE_IDS.SELECTION:
      return {
        page: {
          title: "Add skills",
          id: props.mode.type,
          content: <SelectionPageContent {...props} mode={props.mode} />,
        },
        leftButton: getCancelButton(props.onClose),
        rightButton: getSaveButton(props.handleSave),
      };
    case SKILLS_SHEET_PAGE_IDS.INFO:
      return {
        page: {
          title: "Skill info",
          id: props.mode.type,
          content: <div />,
        },
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: () =>
            props.onModeChange({
              type: SKILLS_SHEET_PAGE_IDS.SELECTION,
            }),
        },
      };
    default:
      assertNever(props.mode);
  }
}

export const getCancelButton = (onClose: () => void) => ({
  label: "Cancel",
  variant: "outline",
  onClick: onClose,
});

export const getSaveButton = (handleSave: () => void) => ({
  label: "Save",
  variant: "primary",
  onClick: handleSave,
});
