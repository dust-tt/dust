import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import { useState } from "react";

export function useModelPickerMenuState() {
  const [isMakersExpanded, setIsMakersExpanded] = useState(false);
  // Which maker is expanded inline. Only used on width-constrained clients
  // (mobile, extension), where makers can't open as hover submenus.
  const [expandedMakerId, setExpandedMakerId] =
    useState<ModelMakerIdType | null>(null);

  const resetMenu = () => {
    setIsMakersExpanded(false);
    setExpandedMakerId(null);
  };

  return {
    menuStateProps: {
      isMakersExpanded,
      onToggleMakers: () => setIsMakersExpanded((expanded) => !expanded),
      expandedMakerId,
      onToggleMaker: (makerId: ModelMakerIdType) =>
        setExpandedMakerId((current) => (current === makerId ? null : makerId)),
    },
    resetMenu,
  };
}
