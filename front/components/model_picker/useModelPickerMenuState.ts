import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { useState } from "react";

export function useModelPickerMenuState() {
  const [isMakersExpanded, setIsMakersExpanded] = useState(false);
  // Which maker is expanded inline. Only used on clients that render makers
  // inline (narrow viewport, or no hover), where makers can't be submenus.
  const [expandedMakerId, setExpandedMakerId] =
    useState<ModelMakerIdType | null>(null);

  const resetMenu = () => {
    setIsMakersExpanded(false);
    setExpandedMakerId(null);
  };

  return {
    menuStateProps: {
      isMakersExpanded,
      onToggleMakers: () => {
        setIsMakersExpanded((expanded) => !expanded);
        // Collapsing the section hides the maker rows, so the expanded maker
        // must not survive into the next expand.
        setExpandedMakerId(null);
      },
      expandedMakerId,
      onToggleMaker: (makerId: ModelMakerIdType) =>
        setExpandedMakerId((current) => (current === makerId ? null : makerId)),
    },
    resetMenu,
  };
}
