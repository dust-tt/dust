import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useReducer, useRef } from "react";

const DESKTOP_INSPECTOR_MEDIA_QUERY = "(min-width: 1280px)";
const INSPECTOR_PANEL_GAP_PX = 16;
const MESSAGE_PANEL_VIEWPORT_GUTTER_PX = 16;

interface InspectorPanelState {
  activeMessageId: string | null;
  isConversationOpen: boolean;
  isWakeUpsOpen: boolean;
  messageRailTakeoverId: string | null;
}

type InspectorPanelAction =
  | { type: "complete_message_panel_exit"; messageId: string }
  | { type: "set_conversation_open"; open: boolean }
  | { type: "set_message_open"; messageId: string; open: boolean }
  | { type: "set_wake_ups_open"; open: boolean }
  | { type: "take_over_message_rail"; messageId: string };

const INITIAL_STATE: InspectorPanelState = {
  activeMessageId: null,
  isConversationOpen: false,
  isWakeUpsOpen: false,
  messageRailTakeoverId: null,
};

function inspectorPanelReducer(
  state: InspectorPanelState,
  action: InspectorPanelAction
): InspectorPanelState {
  switch (action.type) {
    case "complete_message_panel_exit":
      return state.messageRailTakeoverId === action.messageId &&
        state.activeMessageId !== action.messageId
        ? { ...state, messageRailTakeoverId: null }
        : state;
    case "set_conversation_open":
      return action.open
        ? {
            ...state,
            activeMessageId: null,
            isConversationOpen: true,
            messageRailTakeoverId:
              state.activeMessageId ?? state.messageRailTakeoverId,
          }
        : { ...state, isConversationOpen: false };
    case "set_wake_ups_open":
      return action.open
        ? {
            ...state,
            activeMessageId: null,
            isWakeUpsOpen: true,
            messageRailTakeoverId:
              state.activeMessageId ?? state.messageRailTakeoverId,
          }
        : { ...state, isWakeUpsOpen: false };
    case "set_message_open":
      if (action.open) {
        return {
          activeMessageId: action.messageId,
          isConversationOpen: false,
          isWakeUpsOpen: false,
          messageRailTakeoverId:
            state.messageRailTakeoverId === null ? null : action.messageId,
        };
      }

      return state.activeMessageId === action.messageId
        ? {
            ...state,
            activeMessageId: null,
          }
        : state;
    case "take_over_message_rail":
      return state.activeMessageId === action.messageId
        ? { ...state, messageRailTakeoverId: action.messageId }
        : state;
  }
}

export function hasRoomForStickyInspectors(
  stickyInspectors: Pick<DOMRect, "bottom">,
  messagePanel: Pick<DOMRect, "top">
): boolean {
  return messagePanel.top >= stickyInspectors.bottom + INSPECTOR_PANEL_GAP_PX;
}

export function getMessagePanelTopOffsetPx(
  panelBottomPx: number,
  viewportHeightPx: number
): number {
  return Math.min(
    0,
    viewportHeightPx - panelBottomPx - MESSAGE_PANEL_VIEWPORT_GUTTER_PX
  );
}

export function isMessagePanelAttachedToTrigger(
  messagePanel: Pick<DOMRect, "bottom" | "top">,
  trigger: Pick<DOMRect, "bottom" | "top">
): boolean {
  return (
    trigger.top >= 0 &&
    messagePanel.top <= trigger.top &&
    messagePanel.bottom >= trigger.bottom
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
  const messageRailTakeoverIdRef = useRef(state.messageRailTakeoverId);

  useLayoutEffect(() => {
    messageRailTakeoverIdRef.current = state.messageRailTakeoverId;
  }, [state.messageRailTakeoverId]);

  useLayoutEffect(() => {
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
    let currentMessagePanelOffsetPx = 0;

    const measurePanels = () => {
      animationFrameId = null;

      if (
        messagePanel.dataset.messageConsumptionPanelId !== state.activeMessageId
      ) {
        return;
      }

      const messagePanelRect = messagePanel.getBoundingClientRect();
      const isDesktop = desktopInspectorMedia?.matches ?? true;
      let measuredMessagePanelRect = messagePanelRect;
      if (isDesktop) {
        const topOffsetPx = getMessagePanelTopOffsetPx(
          messagePanelRect.bottom - currentMessagePanelOffsetPx,
          window.innerHeight
        );
        const topOffsetDeltaPx = topOffsetPx - currentMessagePanelOffsetPx;
        currentMessagePanelOffsetPx = topOffsetPx;
        messagePanel.style.translate = `0 ${topOffsetPx}px`;
        measuredMessagePanelRect = {
          ...messagePanelRect,
          bottom: messagePanelRect.bottom + topOffsetDeltaPx,
          top: messagePanelRect.top + topOffsetDeltaPx,
          y: messagePanelRect.y + topOffsetDeltaPx,
        };
      } else {
        const topOffsetDeltaPx = -currentMessagePanelOffsetPx;
        currentMessagePanelOffsetPx = 0;
        messagePanel.style.removeProperty("translate");
        measuredMessagePanelRect = {
          ...messagePanelRect,
          bottom: messagePanelRect.bottom + topOffsetDeltaPx,
          top: messagePanelRect.top + topOffsetDeltaPx,
          y: messagePanelRect.y + topOffsetDeltaPx,
        };
      }

      const triggerId = messagePanel.getAttribute("aria-labelledby");
      const messageTrigger = triggerId
        ? document.getElementById(triggerId)
        : null;
      if (
        isDesktop &&
        messageTrigger &&
        !isMessagePanelAttachedToTrigger(
          measuredMessagePanelRect,
          messageTrigger.getBoundingClientRect()
        )
      ) {
        dispatch({
          type: "set_message_open",
          messageId: state.activeMessageId,
          open: false,
        });
        return;
      }

      if (
        isDesktop &&
        messageRailTakeoverIdRef.current !== state.activeMessageId &&
        !hasRoomForStickyInspectors(
          stickyInspectors.getBoundingClientRect(),
          measuredMessagePanelRect
        )
      ) {
        dispatch({
          type: "take_over_message_rail",
          messageId: state.activeMessageId,
        });
      }
    };

    const scheduleMeasurement = () => {
      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(measurePanels);
      }
    };

    measurePanels();
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

  const completeMessagePanelExit = useCallback((messageId: string) => {
    dispatch({ type: "complete_message_panel_exit", messageId });
  }, []);

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
    completeMessagePanelExit,
    isMessageRailTakeover: state.messageRailTakeoverId !== null,
    setConversationOpen,
    setMessageOpen,
    setWakeUpsOpen,
  };
}
