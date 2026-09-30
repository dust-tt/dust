import type { PanelStateResponse } from "@extension/shared/messages";
import { useEffect } from "react";

/**
 * @cc [owner:LeandreLeBizec,label:product] panel-state-responder-per-route
 * Every route element mounted under `ProtectedRoute` (`extension/ui/pages/routes.tsx`) that can be
 * the side panel's active page MUST call `usePanelStateListener`. Otherwise the `getPanelState`
 * external action (`extension/platforms/chrome/background.ts`) always times out to
 * `{ status: "unknown" }` while that page is displayed, instead of reporting `"open"`/`"loading"`.
 */
export function usePanelStateListener({
  workspaceId,
  conversationId,
  podId,
  isLoading,
}: {
  workspaceId: string;
  conversationId: string | null;
  podId: string | null;
  isLoading: boolean;
}) {
  useEffect(() => {
    const onGetPanelState = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("type" in message) ||
        message.type !== "EXT_GET_PANEL_STATE" ||
        !("windowId" in message) ||
        typeof message.windowId !== "number"
      ) {
        return false;
      }

      void chrome.windows
        .getCurrent()
        .then((currentWindow) => {
          const response: PanelStateResponse =
            currentWindow.id === message.windowId
              ? {
                  status: isLoading ? "loading" : "open",
                  workspaceId,
                  conversationId,
                  podId,
                }
              : { status: "unknown" };
          sendResponse(response);
        })
        .catch(() => sendResponse({ status: "unknown" }));
      return true;
    };

    chrome.runtime.onMessage.addListener(onGetPanelState);
    return () => chrome.runtime.onMessage.removeListener(onGetPanelState);
  }, [workspaceId, conversationId, podId, isLoading]);
}
