import { useConversationAutoScroll } from "@app/components/assistant/conversation/useConversationAutoScroll";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resizeCallbacks: Array<(entries: ResizeObserverEntry[]) => void> = [];

beforeEach(() => {
  resizeCallbacks.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push((entries) => callback(entries, this));
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "DOMMatrixReadOnly",
    class {
      m42: number;
      constructor(transform: string) {
        this.m42 = Number(
          transform.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? 0
        );
      }
    }
  );
});

afterEach(() => {
  for (const element of document.querySelectorAll("[data-scroll-test-root]")) {
    element.remove();
  }
  Reflect.deleteProperty(document, "scrollingElement");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(isMobile = false) {
  const list = document.createElement("div");
  list.dataset.scrollTestRoot = "true";
  const content = document.createElement("div");
  const row = document.createElement("div");
  content.appendChild(row);
  content.dataset.testid = "virtuoso-list";
  list.appendChild(content);
  document.body.appendChild(list);
  const scroller = isMobile ? document.documentElement : list;
  let height = 2000;
  let itemCount = 10;
  scroller.scrollTop = 1200;
  vi.spyOn(scroller, "scrollHeight", "get").mockImplementation(() => height);
  vi.spyOn(scroller, "clientHeight", "get").mockReturnValue(800);
  vi.spyOn(list, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, -scroller.scrollTop, 400, height)
  );
  vi.spyOn(row, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, 0, 400, height - 180)
  );
  if (isMobile) {
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: scroller,
    });
    vi.stubGlobal("innerHeight", 800);
  }
  const methods = {
    cancelSmoothScroll: vi.fn(),
    scrollToItem: vi.fn(),
    getScrollLocation: () => ({
      isAtBottom: false,
      bottomOffset: height - scroller.scrollTop - 800,
      listOffset: -scroller.scrollTop,
      scrollHeight: height - 180,
      visibleListHeight: 620,
      lastVisibleItemIndex: itemCount - 1,
      lastItemBottomOffset: 0,
    }),
    scrollerElement: () => list,
    data: { get: () => Array.from({ length: itemCount }) },
  };
  const messageListRef = { current: methods };
  const hook = renderHook(() =>
    useConversationAutoScroll({ isMobile, messageListRef })
  );
  const measureRow = (compensatedTop: number) => {
    const entry: ResizeObserverEntry = {
      target: row,
      contentRect: new DOMRect(0, 0, 400, height - 180),
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    };
    resizeCallbacks[0]([entry]);
    // Virtuoso's observer runs between the two conversation observers.
    scroller.scrollTop = compensatedTop;
    resizeCallbacks[1]([entry]);
  };
  measureRow(scroller.scrollTop);
  return {
    ...hook,
    content,
    methods,
    scroller,
    wheel: (deltaY: number) => {
      list.dispatchEvent(new WheelEvent("wheel", { deltaY }));
    },
    touch: (type: "touchstart" | "touchmove", clientY: number) => {
      const event = new Event(type);
      Object.defineProperty(event, "touches", { value: [{ clientY }] });
      list.dispatchEvent(event);
    },
    scroll: (top: number, newHeight = height) => {
      height = newHeight;
      scroller.scrollTop = top;
      (isMobile ? window : scroller).dispatchEvent(new Event("scroll"));
    },
    resize: (
      newHeight: number,
      top = scroller.scrollTop,
      count = itemCount
    ) => {
      height = newHeight;
      itemCount = count;
      measureRow(top);
    },
  };
}

describe.each([
  false,
  true,
])("conversation auto-scroll (mobile: %s)", (isMobile) => {
  it("detaches on upward scrolling even while content grows", () => {
    const { result, methods, scroll } = setup(isMobile);
    scroll(1110, 2072);
    expect(result.current.current).toBe(false);
    expect(methods.cancelSmoothScroll).toHaveBeenCalledOnce();
  });

  it("clears a retained bottom target after the native scroll moves", () => {
    const { methods, wheel, scroll } = setup(isMobile);
    vi.spyOn(methods, "getScrollLocation").mockReturnValue({
      ...methods.getScrollLocation(),
      isAtBottom: true,
      bottomOffset: 90,
    });
    wheel(-90);
    expect(methods.scrollToItem).not.toHaveBeenCalled();

    scroll(1110);
    expect(methods.scrollToItem).toHaveBeenCalledWith({
      index: 0,
      align: "start-no-overflow",
      offset: 1110,
      behavior: "instant",
    });
  });

  it("detaches on upward intent and reattaches only at the bottom above the input", () => {
    const { result, methods, wheel, scroll } = setup(isMobile);
    expect(result.current.current).toBe(true);
    wheel(-90);
    expect(result.current.current).toBe(false);
    expect(methods.cancelSmoothScroll).toHaveBeenCalledOnce();

    scroll(1110);
    wheel(10);
    scroll(1120);
    // With a 180px sticky input bar, 80px from the scroll bottom still hides text.
    expect(result.current.current).toBe(false);
    scroll(1198);
    expect(result.current.current).toBe(true);
    expect(methods.scrollToItem).toHaveBeenCalledWith({
      index: "LAST",
      align: "end",
      behavior: "instant",
    });
  });

  it("preserves upward movement coalesced with streamed row growth", () => {
    const { result, scroller, wheel, scroll, resize } = setup(isMobile);
    wheel(-90);
    scroll(1110);
    wheel(-90);
    // The browser delivers user scrolling before ResizeObserver measures growth.
    scroll(1020);
    resize(2072, 1092);
    expect(scroller.scrollTop).toBe(1020);
    expect(result.current.current).toBe(false);
  });

  it("preserves idle reading and subsequent movement in either direction", () => {
    const { scroller, wheel, scroll, resize } = setup(isMobile);
    wheel(-90);
    scroll(1110);
    resize(2072, 1182);
    expect(scroller.scrollTop).toBe(1110);

    // Once Virtuoso stops compensating, new content does not move the viewport.
    resize(2144);
    wheel(-90);
    scroll(1020);
    expect(scroller.scrollTop).toBe(1020);
    wheel(90);
    scroll(1110);
    resize(2216);
    expect(scroller.scrollTop).toBe(1110);
  });

  it("keeps Virtuoso's anchoring when older messages are prepended", () => {
    const { scroller, wheel, scroll, resize } = setup(isMobile);
    wheel(-90);
    scroll(1110);
    resize(2240, 1350, 12);
    expect(scroller.scrollTop).toBe(1350);
  });

  it("detaches before an upward touch moves the viewport", () => {
    const { result, touch, methods } = setup(isMobile);
    touch("touchstart", 300);
    touch("touchmove", 340);
    expect(result.current.current).toBe(false);
    expect(methods.cancelSmoothScroll).toHaveBeenCalledOnce();
  });
});

it("cancels iOS transforms and the delayed scroll adjustment without moving a touch gesture", async () => {
  const { content, scroller, touch, scroll, resize } = setup(true);
  touch("touchstart", 300);
  touch("touchmove", 390);
  scroll(1110);

  await act(async () => {
    content.style.transform = "translateY(-72px)";
    resize(2072);
  });
  expect(scroller.scrollTop).toBe(1110);
  expect(content.style.translate).toBe("0px 72px");

  await act(async () => {
    scroller.scrollTop += 72;
    content.style.transform = "translateY(0px)";
  });
  expect(scroller.scrollTop).toBe(1110);
  expect(content.style.translate).toBe("0px 0px");
});
