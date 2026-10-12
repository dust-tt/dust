import { cn, NavigationListItem, SearchMd } from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

const KEY_CAP_CLASS_NAME = cn(
  "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1",
  "border-separator text-xs shadow-xs"
);

/** ⌘ on a Mac, Ctrl everywhere else — the palette answers to both. */
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

interface SidebarSearchProps {
  onClick: () => void;
}

/**
 * Search as an ordinary nav row rather than a field: it opens the palette, and
 * the key caps say so, which is how people learn the shortcut exists.
 */
export function SidebarSearch({ onClick }: SidebarSearchProps) {
  return (
    <NavigationListItem
      label="Search"
      icon={SearchMd}
      onClick={onClick}
      suffix={
        <span className="flex items-center gap-1 text-muted-foreground">
          <span className={KEY_CAP_CLASS_NAME}>{isMac ? "⌘" : "Ctrl"}</span>
          <span className={KEY_CAP_CLASS_NAME}>K</span>
        </span>
      }
    />
  );
}

/** True while the keystroke belongs to whatever the user is writing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

interface SidebarShortcuts {
  onNewConversation: () => void;
  onOpenSearch: () => void;
}

/**
 * The two shortcuts the sidebar advertises. Both stand down while the user is
 * writing, so a bare `c` in a message stays a `c`.
 */
export function useSidebarShortcuts({
  onNewConversation,
  onOpenSearch,
}: SidebarShortcuts) {
  // Held in a ref so the listener is bound once: callers pass inline arrow
  // functions, which would otherwise resubscribe on every render.
  const handlers = useRef({ onNewConversation, onOpenSearch });
  handlers.current = { onNewConversation, onOpenSearch };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlers.current.onOpenSearch();
        return;
      }
      if (
        event.key.toLowerCase() === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        handlers.current.onNewConversation();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

export { KEY_CAP_CLASS_NAME, isMac };
