import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import { useCallback, useEffect } from "react";

/**
 * @cc [owner:tdraier,label:react] side-panel-full-screen
 * Entering full screen MUST widen the side panel to the whole window and close the navigation
 * bar, and leaving it, by its toggle, Escape or closing the panel, MUST restore the panel size and
 * navigation bar from before, even when the panel's content remounted meanwhile. Escape MUST NOT
 * leave full screen when something in the panel already used it, such as closing a menu or a field.
 */
export const useSidePanelFullScreen = (defaultPanelSize: number) => {
  const { closePanel, panelRef, layoutBeforeFullScreenRef } =
    useConversationSidePanelContext();
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const panel = panelRef?.current;

  const [fullScreenHash, setFullScreenHash] = useHashParam(
    FULL_SCREEN_HASH_PARAM
  );
  const isFullScreen = fullScreenHash === "true";

  const restoreLayout = useCallback(() => {
    if (panel) {
      const layout = layoutBeforeFullScreenRef.current;
      setIsNavigationBarOpen(layout?.isNavigationBarOpen ?? true);
      panel.resize(layout?.panelSize ?? defaultPanelSize);
    }
  }, [
    panel,
    layoutBeforeFullScreenRef,
    setIsNavigationBarOpen,
    defaultPanelSize,
  ]);

  const exitFullScreen = useCallback(() => {
    setFullScreenHash(undefined);
  }, [setFullScreenHash]);

  const enterFullScreen = () => {
    layoutBeforeFullScreenRef.current = {
      isNavigationBarOpen,
      panelSize: panel?.getSize() ?? defaultPanelSize,
    };
    setFullScreenHash("true");
  };

  const closePanelAndExitFullScreen = () => {
    if (panel && isFullScreen) {
      setFullScreenHash(undefined);
      restoreLayout();
    }

    closePanel();
  };

  useEffect(() => {
    if (!panel) {
      return;
    }

    if (isFullScreen) {
      panel.resize(100);
      setIsNavigationBarOpen(false);
    } else {
      // Only exit fullscreen if we're currently at 100% & nav bar is closed (= full screen mode)
      if (panel.getSize() === 100 && !isNavigationBarOpen) {
        restoreLayout();
      }
    }
  }, [
    panel,
    isFullScreen,
    isNavigationBarOpen,
    setIsNavigationBarOpen,
    restoreLayout,
  ]);

  // ESC key event listener to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullScreen && !event.defaultPrevented) {
        exitFullScreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullScreen, exitFullScreen]);

  return {
    isFullScreen,
    enterFullScreen,
    exitFullScreen,
    closePanel: closePanelAndExitFullScreen,
  };
};
