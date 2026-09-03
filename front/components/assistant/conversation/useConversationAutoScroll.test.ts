import { useConversationAutoScroll } from "@app/components/assistant/conversation/useConversationAutoScroll";
import { act, renderHook } from "@testing-library/react";
import type { ListScrollLocation } from "@virtuoso.dev/message-list";
import { afterEach, describe, expect, it, vi } from "vitest";

type ScrollMethods = NonNullable<
  Parameters<typeof useConversationAutoScroll>[0]["messageListRef"]["current"]
>;

interface ScrollUpdate {
  scrollTop: number;
  scrollHeight?: number;
  location?: Partial<ListScrollLocation>;
}

const originalScrollingElementDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "scrollingElement"
);
const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "innerHeight"
);
const originalDocumentScrollEndDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "onscrollend"
);

function makeScrollLocation(
  overrides: Partial<ListScrollLocation> = {}
): ListScrollLocation {
  return {
    listOffset: -500,
    visibleListHeight: 420,
    scrollHeight: 1000,
    bottomOffset: 0,
    isAtBottom: true,
    lastVisibleItemIndex: 1,
    lastItemBottomOffset: 0,
    ...overrides,
  };
}

function setupAutoScroll({
  isMobile = false,
  supportsNativeScrollEnd = true,
} = {}) {
  const scrollElement = document.createElement("div");
  let scrollHeight = 1000;
  let location = makeScrollLocation();

  Object.defineProperties(scrollElement, {
    clientHeight: { configurable: true, value: 500 },
    scrollHeight: { configurable: true, get: () => scrollHeight },
  });
  scrollElement.scrollTop = 500;

  if (isMobile) {
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: scrollElement,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });
  }

  const scrollEndTarget = isMobile ? document : scrollElement;
  Object.defineProperty(scrollEndTarget, "onscrollend", {
    configurable: true,
    value: supportsNativeScrollEnd ? null : undefined,
  });

  const methods: ScrollMethods = {
    cancelSmoothScroll: vi.fn(),
    getScrollLocation: () => location,
    scrollerElement: () => scrollElement,
    scrollToItem: vi.fn(),
  };
  const messageListRef = { current: methods };
  const hook = renderHook(() =>
    useConversationAutoScroll({ isMobile, messageListRef })
  );
  const defaultScrollTarget = isMobile ? window : scrollElement;

  const dispatchScroll = (
    {
      scrollTop,
      scrollHeight: nextScrollHeight = scrollHeight,
      location: locationOverrides = {},
    }: ScrollUpdate,
    target: EventTarget = defaultScrollTarget
  ) => {
    act(() => {
      scrollHeight = nextScrollHeight;
      scrollElement.scrollTop = scrollTop;
      location = {
        ...location,
        scrollHeight: nextScrollHeight,
        ...locationOverrides,
      };
      target.dispatchEvent(new Event("scroll"));
    });
  };

  const dispatchWheel = (deltaY: number, ctrlKey = false) => {
    act(() => {
      scrollElement.dispatchEvent(new WheelEvent("wheel", { ctrlKey, deltaY }));
    });
  };

  const dispatchScrollEnd = (target: EventTarget = scrollEndTarget) => {
    act(() => {
      target.dispatchEvent(new Event("scrollend"));
    });
  };

  const makeTouch = (clientY: number): Touch => ({
    clientX: 0,
    clientY,
    force: 0,
    identifier: 0,
    pageX: 0,
    pageY: clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    screenX: 0,
    screenY: clientY,
    target: scrollElement,
  });

  const dispatchTouchStart = (clientY: number) => {
    act(() => {
      scrollElement.dispatchEvent(
        new TouchEvent("touchstart", { touches: [makeTouch(clientY)] })
      );
    });
  };

  const dispatchTouchMove = (clientY: number) => {
    act(() => {
      scrollElement.dispatchEvent(
        new TouchEvent("touchmove", { touches: [makeTouch(clientY)] })
      );
    });
  };

  const dispatchTouchEnd = () => {
    act(() => {
      scrollElement.dispatchEvent(new TouchEvent("touchend", { touches: [] }));
    });
  };

  const dispatchTouch = (startY: number, endY: number) => {
    dispatchTouchStart(startY);
    dispatchTouchMove(endY);
  };

  return {
    ...hook,
    dispatchScroll,
    dispatchScrollEnd,
    dispatchTouch,
    dispatchTouchEnd,
    dispatchWheel,
    methods,
    scrollElement,
  };
}

function detach(harness: ReturnType<typeof setupAutoScroll>, scrollTop = 400) {
  harness.dispatchScroll({
    scrollTop,
    location: { bottomOffset: 500, isAtBottom: false },
  });
  expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
}

function mockAnimationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });

  return {
    runFrame: () => {
      act(() => {
        const frameCallbacks = Array.from(callbacks.values());
        callbacks.clear();
        for (const callback of frameCallbacks) {
          callback(0);
        }
      });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();

  if (originalScrollingElementDescriptor) {
    Object.defineProperty(
      document,
      "scrollingElement",
      originalScrollingElementDescriptor
    );
  } else {
    Reflect.deleteProperty(document, "scrollingElement");
  }

  if (originalInnerHeightDescriptor) {
    Object.defineProperty(window, "innerHeight", originalInnerHeightDescriptor);
  } else {
    Reflect.deleteProperty(window, "innerHeight");
  }

  if (originalDocumentScrollEndDescriptor) {
    Object.defineProperty(
      document,
      "onscrollend",
      originalDocumentScrollEndDescriptor
    );
  } else {
    Reflect.deleteProperty(document, "onscrollend");
  }
});

describe("useConversationAutoScroll", () => {
  describe("detaching", () => {
    it("detaches on a native upward scroll", () => {
      const harness = setupAutoScroll();

      detach(harness);

      expect(harness.methods.cancelSmoothScroll).toHaveBeenCalledOnce();
    });

    it("ignores an upward scroll caused entirely by list height compensation", () => {
      const harness = setupAutoScroll();

      harness.dispatchScroll({
        scrollTop: 400,
        scrollHeight: 900,
        location: { bottomOffset: 100, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.cancelSmoothScroll).not.toHaveBeenCalled();
    });

    it("detaches when upward movement exceeds the concurrent height change", () => {
      const harness = setupAutoScroll();

      harness.dispatchScroll({
        scrollTop: 350,
        scrollHeight: 900,
        location: { bottomOffset: 150, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.cancelSmoothScroll).toHaveBeenCalledOnce();
    });

    it("honors an upward wheel gesture despite a positive net scroll", () => {
      const harness = setupAutoScroll();

      harness.dispatchWheel(-20);
      harness.dispatchScroll({
        scrollTop: 520,
        location: { bottomOffset: 20, isAtBottom: false },
      });
      harness.dispatchScroll({
        scrollTop: 530,
        location: { bottomOffset: 0, isAtBottom: true },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.cancelSmoothScroll).toHaveBeenCalledOnce();
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("ignores pinch-zoom and zero-delta wheel events", () => {
      const harness = setupAutoScroll();

      harness.dispatchWheel(-20, true);
      harness.dispatchWheel(0);

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.cancelSmoothScroll).not.toHaveBeenCalled();
    });

    it("detaches when a touch gesture moves toward earlier content", () => {
      const harness = setupAutoScroll();

      harness.dispatchTouch(100, 120);

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.cancelSmoothScroll).toHaveBeenCalledOnce();
    });

    it("uses window scroll events on mobile", () => {
      const harness = setupAutoScroll({ isMobile: true });
      const update = {
        scrollTop: 400,
        location: { bottomOffset: 100, isAtBottom: false },
      };

      harness.dispatchScroll(update, harness.scrollElement);
      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);

      harness.dispatchScroll(update, window);
      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
    });
  });

  describe("reattaching", () => {
    it("reattaches when a wheel gesture reaches the bottom while content grows", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 600,
        scrollHeight: 1100,
        location: { bottomOffset: 200, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.scrollToItem).toHaveBeenCalledWith({
        index: "LAST",
        align: "end",
        behavior: "instant",
      });
    });

    it("reattaches after a mobile touch gesture while content grows", () => {
      const harness = setupAutoScroll({ isMobile: true });
      harness.dispatchTouch(100, 120);
      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);

      harness.dispatchTouch(120, 100);
      harness.dispatchScroll({
        scrollTop: 600,
        scrollHeight: 1100,
        location: { bottomOffset: 0, isAtBottom: true },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.scrollToItem).toHaveBeenCalledOnce();
    });

    it("keeps a downward gesture until a later scroll event reaches the bottom", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 410,
        location: { bottomOffset: 200, isAtBottom: false },
      });
      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);

      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 200, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.scrollToItem).toHaveBeenCalledOnce();
    });

    it("reattaches at the sticky footer boundary", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 420,
        location: { bottomOffset: 80, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
    });

    it("stays detached just outside the sticky footer boundary", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 419,
        location: { bottomOffset: 81, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("does not treat content growth as downward user movement", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchScroll({
        scrollTop: 520,
        scrollHeight: 1100,
        location: { bottomOffset: 20, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("does not reuse a completed downward gesture for later content growth", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 410,
        location: { bottomOffset: 200, isAtBottom: false },
      });
      harness.dispatchScrollEnd();

      harness.dispatchScroll({
        scrollTop: 510,
        scrollHeight: 1100,
        location: { bottomOffset: 0, isAtBottom: true },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("can be explicitly re-enabled for a new message", () => {
      const harness = setupAutoScroll();
      detach(harness);

      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      act(() => harness.result.current.enableAutoScroll());

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });
  });

  describe("tracking user scroll activity", () => {
    it("ends a wheel gesture on native scrollend", () => {
      const harness = setupAutoScroll();

      harness.dispatchWheel(-100);
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      harness.dispatchScroll({
        scrollTop: 400,
        location: { bottomOffset: 500, isAtBottom: false },
      });
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      harness.dispatchScrollEnd();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
    });

    it("uses document scrollend for a mobile touch gesture", () => {
      const animationFrames = mockAnimationFrames();
      const harness = setupAutoScroll({ isMobile: true });

      harness.dispatchTouch(100, 120);
      harness.dispatchScroll({
        scrollTop: 400,
        location: { bottomOffset: 500, isAtBottom: false },
      });
      harness.dispatchTouchEnd();
      animationFrames.runFrame();
      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      harness.dispatchScrollEnd();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
    });

    it("does not treat list height compensation as user activity", () => {
      const harness = setupAutoScroll();

      harness.dispatchScroll({
        scrollTop: 400,
        scrollHeight: 900,
        location: { bottomOffset: 100, isAtBottom: false },
      });

      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
    });

    it("notifies subscribers when scrolling ends", () => {
      const harness = setupAutoScroll();
      const onScrollEnd = vi.fn();
      const unsubscribe =
        harness.result.current.userScrollActivity.subscribeToEnd(onScrollEnd);

      harness.dispatchWheel(-100);
      harness.dispatchScrollEnd();

      expect(onScrollEnd).toHaveBeenCalledOnce();

      unsubscribe();
      harness.dispatchWheel(-100);
      harness.dispatchScrollEnd();
      expect(onScrollEnd).toHaveBeenCalledOnce();
    });

    it("waits for touch release and stable frames without scrollend support", () => {
      const animationFrames = mockAnimationFrames();
      const harness = setupAutoScroll({ supportsNativeScrollEnd: false });

      harness.dispatchTouch(100, 120);
      animationFrames.runFrame();
      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      harness.dispatchTouchEnd();
      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 550, isAtBottom: false },
      });
      animationFrames.runFrame();
      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
    });

    it("waits for wheel movement to become stable without scrollend support", () => {
      const animationFrames = mockAnimationFrames();
      const harness = setupAutoScroll({ supportsNativeScrollEnd: false });

      harness.dispatchWheel(-100);
      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 550, isAtBottom: false },
      });
      animationFrames.runFrame();
      harness.dispatchScroll({
        scrollTop: 400,
        location: { bottomOffset: 600, isAtBottom: false },
      });
      animationFrames.runFrame();
      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
    });

    it("ends a native gesture that produces no scroll event", () => {
      const animationFrames = mockAnimationFrames();
      const harness = setupAutoScroll();

      harness.dispatchWheel(-100);
      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(true);

      animationFrames.runFrame();
      expect(harness.result.current.userScrollActivity.isActive()).toBe(false);
    });
  });

  it("removes gesture listeners when unmounted", () => {
    const harness = setupAutoScroll();

    harness.unmount();
    harness.dispatchWheel(-20);

    expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
    expect(harness.methods.cancelSmoothScroll).not.toHaveBeenCalled();
  });
});
