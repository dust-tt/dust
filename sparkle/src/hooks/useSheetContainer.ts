import { useEffect, useState } from "react";

export function useSheetContainer(
  mountPortalContainer?: Element
): Element | undefined {
  const [container, setContainer] = useState<Element | undefined>(
    mountPortalContainer
  );

  useEffect(() => {
    if (!container) {
      const dialogElements = document.querySelectorAll(
        ".s-sheet[role=dialog][data-state=open]"
      );
      const lastDialog = dialogElements[dialogElements.length - 1];
      if (lastDialog) {
        setContainer(lastDialog);
      }
    }
  }, [container]);

  return container;
}
