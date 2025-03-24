import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import type { LightWorkspaceType } from "@app/types";

export function useAppKeyboardShortcuts(owner: LightWorkspaceType) {
  const [isNavigationBarOpen, setIsNavigationBarOpen] = useState(true);

  const router = useRouter();

  useEffect(() => {
    function handleKeyboardShortcuts(event: KeyboardEvent) {
      // Check for Command/Control key.
      const isModifier = event.metaKey || event.ctrlKey;

      if (isModifier && event.shiftKey) {
        switch (event.key.toLowerCase()) {
          case "b":
            event.preventDefault();
            setIsNavigationBarOpen((prev) => !prev);
            break;
        }
      } else if (isModifier) {
        switch (event.key) {
          case "/":
            event.preventDefault();
            void router.push(`/w/${owner.sId}/assistant/new`, undefined, {
              shallow: true,
            });
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [owner.sId, router]);

  return { isNavigationBarOpen, setIsNavigationBarOpen };
}
