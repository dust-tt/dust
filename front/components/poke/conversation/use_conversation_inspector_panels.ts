import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useReducer } from "react";

const DESKTOP_INSPECTOR_MEDIA_QUERY = "(min-width: 1280px)";
const MESSAGE_PANEL_VIEWPORT_GUTTER_PX = 16;
const STICKY_INSPECTORS_OFFSET_PROPERTY = "--poke-sticky-inspectors-offset";

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
      return action.open
        ? {
            ...state,
            activeMessageId: null,
            isConversationOpen: true,
            isStickyRailOccluded: false,
          }
        : { ...state, isConversationOpen: false };
    case "set_wake_ups_open":
      return action.open
        ? {
            ...state,
            activeMessageId: null,
            isStickyRailOccluded: false,
            isWakeUpsOpen: true,
          }
        : { ...state, isWakeUpsOpen: false };
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
      if (
        !state.activeMessageId ||
        state.isStickyRailOccluded === action.occluded
      ) {
        return state;
      }

      return { ...state, isStickyRailOccluded: action.occluded };
  }
}

export function areInspectorPanelsOverlapping(
  stickyPanel: Pick<DOMRect, "bottom" | "top">,
  messagePanel: Pick<DOMRect, "bottom" | "top">
): boolean {
  return (
    messagePanel.top < stickyPanel.bottom &&
    messagePanel.bottom > stickyPanel.top
  );
}

export function getStickyInspectorsTopOffsetPx(
  stickyPanel: Pick<DOMRect, "bottom" | "top">,
  messagePanel: Pick<DOMRect, "bottom" | "top">
): number {
  if (!areInspectorPanelsOverlapping(stickyPanel, messagePanel)) {
    return 0;
  }

  return Math.max(-stickyPanel.bottom, messagePanel.top - stickyPanel.bottom);
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
    let isStickyRailOccluded = false;

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

      const stickyInspectorsOffsetPx = isDesktop
        ? getStickyInspectorsTopOffsetPx(
            stickyInspectors.getBoundingClientRect(),
            measuredMessagePanelRect
          )
        : 0;
      stickyInspectors.style.setProperty(
        STICKY_INSPECTORS_OFFSET_PROPERTY,
        `${stickyInspectorsOffsetPx}px`
      );

      const nextIsStickyRailOccluded = stickyInspectorsOffsetPx < 0;
      if (nextIsStickyRailOccluded !== isStickyRailOccluded) {
        isStickyRailOccluded = nextIsStickyRailOccluded;
        dispatch({
          type: "set_sticky_rail_occluded",
          occluded: nextIsStickyRailOccluded,
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
      messagePanel.style.removeProperty("translate");
      stickyInspectors.style.removeProperty(STICKY_INSPECTORS_OFFSET_PROPERTY);
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
