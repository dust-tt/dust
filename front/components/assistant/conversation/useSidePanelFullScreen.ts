import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { useDesktopNavigation } from "@app/components/navigation/DesktopNavigationContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { FULL_SCREEN_HASH_PARAM } from "@app/types/conversation_side_panel";
import { useCallback, useEffect, useRef } from "react";

/**
 * @cc [owner:tdraier,label:react] side-panel-full-screen
 * Entering full screen MUST widen the side panel to the whole window and close the navigation
 * bar, and leaving it, by its toggle, Escape or closing the panel, MUST restore the panel size and
 * navigation bar from before. Escape MUST NOT leave full screen when something in the panel
 * already used it, such as closing a menu or a field.
 */
export const useSidePanelFullScreen = (defaultPanelSize: number) => {
  const { closePanel, panelRef } = useConversationSidePanelContext();
  const { isNavigationBarOpen, setIsNavigationBarOpen } =
    useDesktopNavigation();
  const isNavBarPrevOpenRef = useRef(isNavigationBarOpen);
  const prevPanelSizeRef = useRef(defaultPanelSize);
  const panel = panelRef?.current;

  const [fullScreenHash, setFullScreenHash] = useHashParam(
    FULL_SCREEN_HASH_PARAM
  );
  const isFullScreen = fullScreenHash === "true";

  const restoreLayout = useCallback(() => {
    if (panel) {
      setIsNavigationBarOpen(isNavBarPrevOpenRef.current ?? true);
      panel.resize(prevPanelSizeRef.current ?? defaultPanelSize);
    }
  }, [panel, setIsNavigationBarOpen, defaultPanelSize]);

  const exitFullScreen = useCallback(() => {
    setFullScreenHash(undefined);
  }, [setFullScreenHash]);

  const enterFullScreen = () => {
    isNavBarPrevOpenRef.current = isNavigationBarOpen;

    if (panel) {
      prevPanelSizeRef.current = panel.getSize();
    }

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
