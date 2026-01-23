import { useMemo } from "react";

/**
 * Detects if the user is on a Mac platform
 */
function useIsMac(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }, []);
}

/**
 * Formats a keyboard shortcut for display based on the user's platform.
 *
 * @param shortcut - The shortcut definition. Use "Mod" for Cmd (Mac) / Ctrl (Windows/Linux)
 * @example
 * formatKeyboardShortcut("Mod+B") // Returns "⌘B" on Mac, "Ctrl+B" on Windows/Linux
 * formatKeyboardShortcut("Mod+Shift+H") // Returns "⌘⇧H" on Mac, "Ctrl+Shift+H" on Windows/Linux
 */
export function useKeyboardShortcutLabel(shortcut: string | undefined): string {
  const isMac = useIsMac();

  return useMemo(() => {
    if (!shortcut) {
      return "";
    }

    let formatted = shortcut;

    if (isMac) {
      // Mac symbols
      formatted = formatted
        .replace(/Mod/g, "⌘")
        .replace(/Cmd/g, "⌘")
        .replace(/Ctrl/g, "⌃")
        .replace(/Shift/g, "⇧")
        .replace(/Alt/g, "⌥")
        .replace(/\+/g, "");
    } else {
      // Windows/Linux labels
      formatted = formatted.replace(/Mod/g, "Ctrl");
    }

    return formatted;
  }, [shortcut, isMac]);
}
