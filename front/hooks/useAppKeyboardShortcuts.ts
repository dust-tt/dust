import { useCommandPalette } from "@app/components/command_palette/CommandPaletteContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useAppKeyboardShortcuts(owner: LightWorkspaceType) {
  const { toggleNavigationBar } = useDesktopNavigation();
  const { open: openCommandPalette } = useCommandPalette();

  const router = useAppRouter();

  useEffect(() => {
    function openNewConversation() {
      void router.push(getConversationRoute(owner.sId), undefined, {
        shallow: true,
      });
    }

    function handleKeyboardShortcuts(event: KeyboardEvent) {
      const isModifier = event.metaKey || event.ctrlKey;

      // Bare "c" → new conversation (Linear/Gmail-style). Skip while typing.
      if (
        !isModifier &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "c" &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        openNewConversation();
        return;
      }

      if (!isModifier) {
        return;
      }

      // Legacy Mod+/: match produced "/" so AZERTY (Shift+:) still works.
      // Not shown in the UI — browsers like Firefox may still steal this combo.
      if (event.key === "/") {
        event.preventDefault();
        openNewConversation();
        return;
      }

      if (event.shiftKey) {
        switch (event.key.toLowerCase()) {
          case "b":
            event.preventDefault();
            toggleNavigationBar();
            break;
        }
        return;
      }

      switch (event.key.toLowerCase()) {
        case "k":
          event.preventDefault();
          openCommandPalette();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [owner.sId, router, toggleNavigationBar, openCommandPalette]);
}
