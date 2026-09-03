import {
  areInspectorPanelsOverlapping,
  getMessagePanelMaxHeightPx,
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
    expect(result.current.isStickyRailOccluded).toBe(false);
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
    expect(result.current.isStickyRailOccluded).toBe(false);

    act(() => result.current.setMessageOpen("message_1", true));
    act(() => result.current.setWakeUpsOpen(true));
    act(flushAnimationFrame);

    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.isStickyRailOccluded).toBe(false);
    expect(result.current.isWakeUpsOpen).toBe(true);
  });

  it("hides the sticky rail while the message panel crosses it", () => {
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
    expect(result.current.isStickyRailOccluded).toBe(false);
    expect(messagePanel.style.maxHeight).toBe(
      `${getMessagePanelMaxHeightPx(500, window.innerHeight)}px`
    );

    messagePanelRect = rect(170, 470);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(flushAnimationFrame);

    expect(result.current.isConversationOpen).toBe(false);
    expect(result.current.isStickyRailOccluded).toBe(true);
    expect(messagePanel.style.maxHeight).toBe(
      `${getMessagePanelMaxHeightPx(170, window.innerHeight)}px`
    );

    messagePanelRect = rect(-400, -100);
    act(() => window.dispatchEvent(new Event("scroll")));
    act(flushAnimationFrame);

    expect(result.current.isStickyRailOccluded).toBe(false);
  });

  it("does not hide the inspectors in the single-column layout", () => {
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

    expect(result.current.isStickyRailOccluded).toBe(false);
    expect(messagePanel.style.maxHeight).toBe("");
  });
});

describe("areInspectorPanelsOverlapping", () => {
  it("uses a small margin so sticky inspectors close before contact", () => {
    expect(areInspectorPanelsOverlapping(rect(16, 180), rect(191, 400))).toBe(
      true
    );
    expect(areInspectorPanelsOverlapping(rect(16, 180), rect(193, 400))).toBe(
      false
    );
  });
});

describe("getMessagePanelMaxHeightPx", () => {
  it("keeps the panel inside the viewport with a bottom gutter", () => {
    expect(getMessagePanelMaxHeightPx(300, 800)).toBe(484);
  });

  it("never returns a negative height", () => {
    expect(getMessagePanelMaxHeightPx(800, 800)).toBe(0);
  });
});
