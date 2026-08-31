import { useState } from "react";

export function useModelPickerMenuState() {
  const [isMakersExpanded, setIsMakersExpanded] = useState(false);

  const resetMenu = () => {
    setIsMakersExpanded(false);
  };

  return {
    menuStateProps: {
      isMakersExpanded,
      onToggleMakers: () => setIsMakersExpanded((expanded) => !expanded),
    },
    resetMenu,
  };
}
