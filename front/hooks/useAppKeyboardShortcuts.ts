import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect } from "react";

export function useAppKeyboardShortcuts(owner: LightWorkspaceType) {
  const { toggleNavigationBar } = useDesktopNavigation();
  const { open: openCommandPalette } = useCommandPalette();
  const { isDark, setTheme } = useTheme();

  const router = useAppRouter();

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
          case "u":
            // Toggle between light and dark. When the theme follows the system, switch to the
            // opposite of what is currently displayed. Not "l": macOS binds Shift+Cmd+L to the
            // "Search with Google" service and swallows the key before the page sees it.
            event.preventDefault();
            setTheme(isDark ? "light" : "dark");
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
          case "k":
            event.preventDefault();
            openCommandPalette();
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [
    owner.sId,
    router,
    toggleNavigationBar,
    openCommandPalette,
    isDark,
    setTheme,
  ]);
}
