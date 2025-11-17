import { useRouter } from "next/router";
import { useEffect } from "react";

import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types";

export function useAppKeyboardShortcuts(owner: LightWorkspaceType) {
  const { toggleNavigationBar } = useDesktopNavigation();

  const router = useRouter();

  useEffect(() => {
    function handleKeyboardShortcuts(event: KeyboardEvent) {
      // Check for Command/Control key.
      const isModifier = event.metaKey || event.ctrlKey;

      if (isModifier && event.shiftKey) {
        switch (event.key.toLowerCase()) {
          case "b":
            event.preventDefault();
            toggleNavigationBar();
            break;
        }
      } else if (isModifier) {
        switch (event.key) {
          case "/":
            event.preventDefault();
            void router.push(getConversationRoute(owner.sId), undefined, {
              shallow: true,
            });
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [owner.sId, router, toggleNavigationBar]);
}
