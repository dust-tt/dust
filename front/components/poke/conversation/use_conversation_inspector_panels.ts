import type { RefObject } from "react";
import { useCallback, useEffect, useReducer } from "react";

const COLLISION_MARGIN_PX = 12;
const DESKTOP_INSPECTOR_MEDIA_QUERY = "(min-width: 1280px)";

interface InspectorPanelState {
  activeMessageId: string | null;
  isConversationOpen: boolean;
  isStickyRailOccluded: boolean;
  isWakeUpsOpen: boolean;
}

type InspectorPanelAction =
  | { type: "set_conversation_open"; open: boolean }
  | { type: "set_message_open"; messageId: string; open: boolean }
  | { type: "set_sticky_rail_occluded"; occluded: boolean }
  | { type: "set_wake_ups_open"; open: boolean };

const INITIAL_STATE: InspectorPanelState = {
  activeMessageId: null,
  isConversationOpen: false,
  isStickyRailOccluded: false,
  isWakeUpsOpen: false,
};

function inspectorPanelReducer(
  state: InspectorPanelState,
  action: InspectorPanelAction
): InspectorPanelState {
  switch (action.type) {
    case "set_conversation_open":
      return { ...state, isConversationOpen: action.open };
    case "set_wake_ups_open":
      return { ...state, isWakeUpsOpen: action.open };
    case "set_message_open":
      if (action.open) {
        return {
          activeMessageId: action.messageId,
          isConversationOpen: false,
          isStickyRailOccluded: false,
          isWakeUpsOpen: false,
        };
      }

      return state.activeMessageId === action.messageId
        ? {
            ...state,
            activeMessageId: null,
            isStickyRailOccluded: false,
          }
        : state;
    case "set_sticky_rail_occluded":
      if (action.occluded) {
        return state.isStickyRailOccluded &&
          !state.isConversationOpen &&
          !state.isWakeUpsOpen
          ? state
          : {
              ...state,
              isConversationOpen: false,
              isStickyRailOccluded: true,
              isWakeUpsOpen: false,
            };
      }

      return state.isStickyRailOccluded
        ? { ...state, isStickyRailOccluded: false }
        : state;
  }
}

export function areInspectorPanelsOverlapping(
  stickyPanel: Pick<DOMRect, "bottom" | "top">,
  messagePanel: Pick<DOMRect, "bottom" | "top">
): boolean {
  return (
    messagePanel.top < stickyPanel.bottom + COLLISION_MARGIN_PX &&
    messagePanel.bottom > stickyPanel.top - COLLISION_MARGIN_PX
  );
}

interface UseConversationInspectorPanelsProps {
  activeMessagePanelRef: RefObject<HTMLDivElement | null>;
  stickyInspectorsRef: RefObject<HTMLElement | null>;
}

export function useConversationInspectorPanels({
  activeMessagePanelRef,
  stickyInspectorsRef,
}: UseConversationInspectorPanelsProps) {
  const [state, dispatch] = useReducer(inspectorPanelReducer, INITIAL_STATE);

  useEffect(() => {
    if (!state.activeMessageId) {
      return;
    }

    const messagePanel = activeMessagePanelRef.current;
    const stickyInspectors = stickyInspectorsRef.current;
    if (!messagePanel || !stickyInspectors) {
      return;
    }

    const desktopInspectorMedia =
      typeof window.matchMedia === "function"
        ? window.matchMedia(DESKTOP_INSPECTOR_MEDIA_QUERY)
        : null;
    let animationFrameId: number | null = null;

    const measureOverlap = () => {
      animationFrameId = null;

      if (
        messagePanel.dataset.messageConsumptionPanelId !== state.activeMessageId
      ) {
        return;
      }

      const isOccluded =
        (desktopInspectorMedia?.matches ?? true) &&
        areInspectorPanelsOverlapping(
          stickyInspectors.getBoundingClientRect(),
          messagePanel.getBoundingClientRect()
        );

      dispatch({ type: "set_sticky_rail_occluded", occluded: isOccluded });
    };

    const scheduleMeasurement = () => {
      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(measureOverlap);
      }
    };

    scheduleMeasurement();
    window.addEventListener("resize", scheduleMeasurement);
    window.addEventListener("scroll", scheduleMeasurement, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasurement);
    resizeObserver?.observe(messagePanel);
    resizeObserver?.observe(stickyInspectors);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      window.removeEventListener("scroll", scheduleMeasurement, true);
    };
  }, [activeMessagePanelRef, state.activeMessageId, stickyInspectorsRef]);

  const setConversationOpen = useCallback((open: boolean) => {
    dispatch({ type: "set_conversation_open", open });
  }, []);

  const setMessageOpen = useCallback((messageId: string, open: boolean) => {
    dispatch({ type: "set_message_open", messageId, open });
  }, []);

  const setWakeUpsOpen = useCallback((open: boolean) => {
    dispatch({ type: "set_wake_ups_open", open });
  }, []);

  return {
    ...state,
    setConversationOpen,
    setMessageOpen,
    setWakeUpsOpen,
  };
}
