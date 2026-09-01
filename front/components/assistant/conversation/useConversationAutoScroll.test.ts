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

function setupAutoScroll({ isMobile = false } = {}) {
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

  const dispatchTouch = (startY: number, endY: number) => {
    act(() => {
      scrollElement.dispatchEvent(
        new TouchEvent("touchstart", { touches: [makeTouch(startY)] })
      );
      scrollElement.dispatchEvent(
        new TouchEvent("touchmove", { touches: [makeTouch(endY)] })
      );
    });
  };

  return {
    ...hook,
    dispatchScroll,
    dispatchTouch,
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

afterEach(() => {
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
        location: { bottomOffset: 0, isAtBottom: true },
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

    it("reattaches after a stable native downward scroll", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 20, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.scrollToItem).toHaveBeenCalledOnce();
    });

    it("reattaches at the sticky footer boundary", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 80, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
    });

    it("stays detached just outside the sticky footer boundary", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 81, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("does not treat content growth as downward user movement", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchScroll({
        scrollTop: 500,
        scrollHeight: 1100,
        location: { bottomOffset: 20, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("does not reuse a downward gesture after its scroll event", () => {
      const harness = setupAutoScroll();
      detach(harness);

      harness.dispatchWheel(100);
      harness.dispatchScroll({
        scrollTop: 450,
        location: { bottomOffset: 200, isAtBottom: false },
      });
      harness.dispatchScroll({
        scrollTop: 550,
        scrollHeight: 1100,
        location: { bottomOffset: 20, isAtBottom: false },
      });

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(false);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
    });

    it("can be explicitly re-enabled for a new message", () => {
      const harness = setupAutoScroll();
      detach(harness);

      act(() => harness.result.current.enableAutoScroll());

      expect(harness.result.current.isAutoScrollEnabledRef.current).toBe(true);
      expect(harness.methods.scrollToItem).not.toHaveBeenCalled();
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
