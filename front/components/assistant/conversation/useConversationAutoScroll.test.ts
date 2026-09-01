import { useConversationAutoScroll } from "@app/components/assistant/conversation/useConversationAutoScroll";
import { act, renderHook } from "@testing-library/react";
import type { ListScrollLocation } from "@virtuoso.dev/message-list";
import { describe, expect, it, vi } from "vitest";

type ScrollMethods = NonNullable<
  Parameters<typeof useConversationAutoScroll>[0]["messageListRef"]["current"]
>;

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

function setupAutoScroll() {
  const scrollElement = document.createElement("div");
  let scrollHeight = 1000;
  let location = makeScrollLocation();

  Object.defineProperties(scrollElement, {
    clientHeight: { configurable: true, value: 500 },
    scrollHeight: { configurable: true, get: () => scrollHeight },
  });
  scrollElement.scrollTop = 500;

  const methods: ScrollMethods = {
    cancelSmoothScroll: vi.fn(),
    getScrollLocation: () => location,
    scrollerElement: () => scrollElement,
    scrollToItem: vi.fn(),
  };
  const messageListRef = { current: methods };
  const hook = renderHook(() =>
    useConversationAutoScroll({ isMobile: false, messageListRef })
  );

  return {
    ...hook,
    methods,
    scrollElement,
    setLocation: (nextLocation: ListScrollLocation) => {
      location = nextLocation;
    },
    setScrollHeight: (nextScrollHeight: number) => {
      scrollHeight = nextScrollHeight;
    },
  };
}

describe("useConversationAutoScroll", () => {
  it("reattaches when the user scrolls down while streamed content grows", () => {
    const { methods, result, scrollElement, setLocation, setScrollHeight } =
      setupAutoScroll();

    act(() => {
      scrollElement.scrollTop = 400;
      setLocation(makeScrollLocation({ bottomOffset: 100, isAtBottom: false }));
      scrollElement.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.isAutoScrollEnabledRef.current).toBe(false);

    act(() => {
      scrollElement.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
      setScrollHeight(1100);
      scrollElement.scrollTop = 600;
      setLocation(
        makeScrollLocation({
          bottomOffset: 0,
          isAtBottom: true,
          scrollHeight: 1100,
        })
      );
      scrollElement.dispatchEvent(new Event("scroll"));
    });

    expect(result.current.isAutoScrollEnabledRef.current).toBe(true);
    expect(methods.scrollToItem).toHaveBeenCalledWith({
      index: "LAST",
      align: "end",
      behavior: "instant",
    });
  });

  it("detaches on an upward wheel gesture despite a positive net scroll", () => {
    const { methods, result, scrollElement, setLocation } = setupAutoScroll();

    act(() => {
      scrollElement.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
      scrollElement.scrollTop = 520;
      setLocation(makeScrollLocation({ bottomOffset: 20, isAtBottom: false }));
      scrollElement.dispatchEvent(new Event("scroll"));
    });

    expect(result.current.isAutoScrollEnabledRef.current).toBe(false);
    expect(methods.cancelSmoothScroll).toHaveBeenCalledOnce();
    expect(methods.scrollToItem).not.toHaveBeenCalled();
  });
});
