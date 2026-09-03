import {
  getMessagePanelTopOffsetPx,
  hasRoomForStickyInspectors,
  isMessagePanelAttachedToTrigger,
  useConversationInspectorPanels,
} from "@app/components/poke/conversation/use_conversation_inspector_panels";
import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function rect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 400,
    top,
    width: 400,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

describe("useConversationInspectorPanels", () => {
  const animationFrames: FrameRequestCallback[] = [];

  beforeEach(() => {
    animationFrames.length = 0;
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushAnimationFrame() {
    const callback = animationFrames.shift();
    callback?.(0);
  }

  it("closes both sticky inspectors when a message panel opens", () => {
    const activeMessagePanelRef: RefObject<HTMLDivElement | null> = {
      current: null,
    };
    const stickyInspectorsRef: RefObject<HTMLElement | null> = {
      current: null,
    };
    const { result } = renderHook(() =>
      useConversationInspectorPanels({
        activeMessagePanelRef,
        stickyInspectorsRef,
      })
    );

    act(() => {
      result.current.setConversationOpen(true);
      result.current.setWakeUpsOpen(true);
    });
    expect(result.current.isConversationOpen).toBe(true);
    expect(result.current.isWakeUpsOpen).toBe(true);

    act(() => result.current.setMessageOpen("message_1", true));

    expect(result.current.activeMessageId).toBe("message_1");
    expect(result.current.isConversationOpen).toBe(false);
    expect(result.current.isWakeUpsOpen).toBe(false);
  });

  it("gives a sticky inspector ownership over a colliding message panel", () => {
    let messagePanelRect = rect(500, 800);
    const messagePanel = document.createElement("div");
    messagePanel.dataset.messageConsumptionPanelId = "message_1";
    vi.spyOn(messagePanel, "getBoundingClientRect").mockImplementation(
      () => messagePanelRect
    );
    const stickyInspectors = document.createElement("aside");
    vi.spyOn(stickyInspectors, "getBoundingClientRect").mockReturnValue(
      rect(16, 180)
    );
    const activeMessagePanelRef: RefObject<HTMLDivElement | null> = {
      current: messagePanel,
    };
    const stickyInspectorsRef: RefObject<HTMLElement | null> = {
      current: stickyInspectors,
    };
    const { result } = renderHook(() =>
      useConversationInspectorPanels({
        activeMessagePanelRef,
        stickyInspectorsRef,
      })
    );

    act(() => result.current.setMessageOpen("message_1", true));
    act(flushAnimationFrame);

    messagePanelRect = rect(170, 470);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(() => result.current.setConversationOpen(true));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.isConversationOpen).toBe(true);

    act(() => result.current.setMessageOpen("message_1", true));
    act(() => result.current.setWakeUpsOpen(true));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.isWakeUpsOpen).toBe(true);
  });

  it("closes the message panel before it crowds the sticky inspectors", () => {
    let messagePanelRect = rect(500, 700);
    const messagePanel = document.createElement("div");
    messagePanel.dataset.messageConsumptionPanelId = "message_1";
    vi.spyOn(messagePanel, "getBoundingClientRect").mockImplementation(
      () => messagePanelRect
    );

    const stickyInspectors = document.createElement("aside");
    vi.spyOn(stickyInspectors, "getBoundingClientRect").mockReturnValue(
      rect(16, 180)
    );

    const activeMessagePanelRef: RefObject<HTMLDivElement | null> = {
      current: messagePanel,
    };
    const stickyInspectorsRef: RefObject<HTMLElement | null> = {
      current: stickyInspectors,
    };
    const { result } = renderHook(() =>
      useConversationInspectorPanels({
        activeMessagePanelRef,
        stickyInspectorsRef,
      })
    );

    act(() => result.current.setMessageOpen("message_1", true));
    act(flushAnimationFrame);
    expect(result.current.activeMessageId).toBe("message_1");
    expect(messagePanel.style.translate).toBe("0 0px");
    expect(messagePanel.style.top).toBe("");

    messagePanelRect = rect(196, 496);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBe("message_1");

    messagePanelRect = rect(195, 495);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBeNull();
  });

  it("does not enforce inspector spacing in the single-column layout", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    const messagePanel = document.createElement("div");
    messagePanel.dataset.messageConsumptionPanelId = "message_1";
    vi.spyOn(messagePanel, "getBoundingClientRect").mockReturnValue(
      rect(100, 400)
    );
    const stickyInspectors = document.createElement("aside");
    vi.spyOn(stickyInspectors, "getBoundingClientRect").mockReturnValue(
      rect(16, 180)
    );
    const activeMessagePanelRef: RefObject<HTMLDivElement | null> = {
      current: messagePanel,
    };
    const stickyInspectorsRef: RefObject<HTMLElement | null> = {
      current: stickyInspectors,
    };
    const { result } = renderHook(() =>
      useConversationInspectorPanels({
        activeMessagePanelRef,
        stickyInspectorsRef,
      })
    );

    act(() => result.current.setMessageOpen("message_1", true));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBe("message_1");
    expect(messagePanel.style.translate).toBe("");
  });

  it("closes a message panel before it detaches from its trigger", () => {
    const messagePanel = document.createElement("div");
    messagePanel.dataset.messageConsumptionPanelId = "message_1";
    messagePanel.setAttribute("aria-labelledby", "message_1_trigger");
    vi.spyOn(messagePanel, "getBoundingClientRect").mockReturnValue(
      rect(760, 1060)
    );

    const messageTrigger = document.createElement("button");
    messageTrigger.id = "message_1_trigger";
    vi.spyOn(messageTrigger, "getBoundingClientRect").mockReturnValue(
      rect(760, 804)
    );
    document.body.append(messageTrigger, messagePanel);

    const stickyInspectors = document.createElement("aside");
    vi.spyOn(stickyInspectors, "getBoundingClientRect").mockReturnValue(
      rect(16, 180)
    );
    const activeMessagePanelRef: RefObject<HTMLDivElement | null> = {
      current: messagePanel,
    };
    const stickyInspectorsRef: RefObject<HTMLElement | null> = {
      current: stickyInspectors,
    };
    const { result } = renderHook(() =>
      useConversationInspectorPanels({
        activeMessagePanelRef,
        stickyInspectorsRef,
      })
    );

    act(() => result.current.setMessageOpen("message_1", true));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBeNull();
  });

  it("closes a message panel when its trigger scrolls past the viewport top", () => {
    let messagePanelRect = rect(-100, 600);
    const messagePanel = document.createElement("div");
    messagePanel.dataset.messageConsumptionPanelId = "message_1";
    messagePanel.setAttribute("aria-labelledby", "message_1_trigger");
    vi.spyOn(messagePanel, "getBoundingClientRect").mockImplementation(
      () => messagePanelRect
    );

    let messageTriggerRect = rect(20, 64);
    const messageTrigger = document.createElement("button");
    messageTrigger.id = "message_1_trigger";
    vi.spyOn(messageTrigger, "getBoundingClientRect").mockImplementation(
      () => messageTriggerRect
    );
    document.body.append(messageTrigger, messagePanel);

    const stickyInspectors = document.createElement("aside");
    vi.spyOn(stickyInspectors, "getBoundingClientRect").mockReturnValue(
      rect(-500, -400)
    );
    const activeMessagePanelRef: RefObject<HTMLDivElement | null> = {
      current: messagePanel,
    };
    const stickyInspectorsRef: RefObject<HTMLElement | null> = {
      current: stickyInspectors,
    };
    const { result } = renderHook(() =>
      useConversationInspectorPanels({
        activeMessagePanelRef,
        stickyInspectorsRef,
      })
    );

    act(() => result.current.setMessageOpen("message_1", true));
    act(flushAnimationFrame);
    expect(result.current.activeMessageId).toBe("message_1");

    messagePanelRect = rect(-121, 579);
    messageTriggerRect = rect(-1, 43);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBeNull();
  });
});

describe("hasRoomForStickyInspectors", () => {
  it("reserves one spacing unit between the sticky and message inspectors", () => {
    expect(hasRoomForStickyInspectors(rect(16, 180), rect(196, 400))).toBe(
      true
    );
    expect(hasRoomForStickyInspectors(rect(16, 180), rect(195, 400))).toBe(
      false
    );
  });
});

describe("getMessagePanelTopOffsetPx", () => {
  it("shifts the panel up when its bottom would leave the viewport", () => {
    expect(getMessagePanelTopOffsetPx(900, 800)).toBe(-116);
  });

  it("keeps the panel aligned with its trigger when it already fits", () => {
    expect(getMessagePanelTopOffsetPx(700, 800)).toBe(0);
  });
});

describe("isMessagePanelAttachedToTrigger", () => {
  it("keeps a panel that spans its trigger", () => {
    expect(
      isMessagePanelAttachedToTrigger(rect(100, 500), rect(200, 244))
    ).toBe(true);
  });

  it("rejects a panel whose top or bottom has passed its trigger", () => {
    expect(
      isMessagePanelAttachedToTrigger(rect(201, 500), rect(200, 244))
    ).toBe(false);
    expect(
      isMessagePanelAttachedToTrigger(rect(100, 243), rect(200, 244))
    ).toBe(false);
  });

  it("rejects a panel after its trigger crosses the viewport top", () => {
    expect(isMessagePanelAttachedToTrigger(rect(-400, 400), rect(-1, 43))).toBe(
      false
    );
  });
});
