import { useConversationInspectorPanels } from "@app/components/poke/conversation/use_conversation_inspector_panels";
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

  it("closes the sticky inspectors when a message panel opens", () => {
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
      result.current.setMessageOpen("message_1", true);
    });

    expect(result.current.activeMessageId).toBe("message_1");
    expect(result.current.isConversationOpen).toBe(false);
    expect(result.current.isWakeUpsOpen).toBe(false);
  });

  it("takes over the rail until a colliding message panel finishes exiting", () => {
    let messagePanelRect = rect(500, 900);
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
    expect(messagePanel.style.translate).not.toBe("0 0px");

    messagePanelRect = rect(352, 1052);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBe("message_1");
    expect(result.current.isMessageRailTakeover).toBe(true);

    act(() => result.current.setMessageOpen("message_1", false));
    expect(result.current.isMessageRailTakeover).toBe(true);

    act(() => result.current.completeMessagePanelExit("message_1"));
    expect(result.current.isMessageRailTakeover).toBe(false);
  });

  it("closes the message panel when its trigger scrolls above the viewport", () => {
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
