// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { VizContext } from "@viz/app/components/VizContext";
import { SlideThumbnail } from "@viz/components/dust/slideshow/SlideThumbnail";
import {
  Slide as LegacySlide,
  Slideshow as LegacySlideshow,
} from "@viz/components/dust/slideshow/v1";
import { Slide, Slideshow } from "@viz/components/dust/slideshow/v2";
import { Button } from "@viz/components/ui/button";
import { createRef, forwardRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let motionStyle: HTMLStyleElement;

beforeEach(() => {
  // JSDOM does not run CSS animations, so dismissals must complete without them.
  motionStyle = document.createElement("style");
  motionStyle.textContent = `
    [data-vaul-drawer][data-vaul-snap-points=false][data-vaul-drawer-direction=left][data-state],
    [data-vaul-overlay][data-vaul-snap-points=false][data-state] {
      animation-name: none
    }
  `;
  document.head.appendChild(motionStyle);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];

      constructor(private callback: IntersectionObserverCallback) {}

      observe(target: Element) {
        this.callback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              time: 0,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
            },
          ],
          this
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute("aria-hidden") === "true" ? 176 : 1600;
    }
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute("aria-hidden") === "true" ? 99 : 900;
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("aspect-video")
        ? new DOMRect(0, 0, 176, 99)
        : new DOMRect();
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  motionStyle.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ForwardedContent = forwardRef<HTMLDivElement>(
  function ForwardedContent(_props, ref) {
    return <div ref={ref}>Forwarded content</div>;
  }
);

const versions = [
  {
    name: "v2",
    Root: Slideshow,
    DeckSlide: Slide,
    presentationLabel: "Slideshow",
  },
  {
    name: "v1",
    Root: LegacySlideshow.Root,
    DeckSlide: LegacySlide,
    presentationLabel: "Slide 1 of 2",
  },
];

describe.each(versions)("$name slide grid", ({
  Root,
  DeckSlide,
  presentationLabel,
}) => {
  function Counter() {
    const [count, setCount] = useState(0);
    return (
      <button type="button" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
    );
  }

  it("reveals the trigger only near the presentation's left edge", () => {
    render(
      <Root>
        <DeckSlide>First</DeckSlide>
        <DeckSlide>Last</DeckSlide>
      </Root>
    );
    const presentation = screen.getByLabelText(presentationLabel, {
      selector: "main, div",
    });
    const opener = screen.getByRole("button", { name: "Show slide previews" });
    vi.spyOn(presentation, "getBoundingClientRect").mockReturnValue(
      new DOMRect(200, 0, 1600, 900)
    );

    fireEvent.mouseMove(presentation, { clientX: 1000 });
    expect(opener.parentElement?.classList.contains("opacity-0")).toBe(true);
    fireEvent.mouseMove(presentation, { clientX: 240 });
    expect(opener.parentElement?.classList.contains("opacity-100")).toBe(true);
    fireEvent.mouseMove(presentation, { clientX: 400 });
    expect(opener.parentElement?.classList.contains("opacity-0")).toBe(true);
    fireEvent.mouseMove(presentation, { clientX: 270 });
    expect(opener.parentElement?.classList.contains("opacity-100")).toBe(true);
    fireEvent.mouseLeave(presentation);
    expect(opener.parentElement?.classList.contains("opacity-0")).toBe(true);
  });

  it.each([
    { width: 1600, height: 900 },
    { width: 2400, height: 900 },
    { width: 900, height: 1600 },
  ])("fills each preview at 16:9 inside a $width by $height frame", async (frame) => {
    render(
      <Root>
        <DeckSlide>
          <div
            className="h-full w-full"
            style={{ background: "linear-gradient(90deg, indigo, coral)" }}
          >
            First slide
          </div>
        </DeckSlide>
        <DeckSlide>Last slide</DeckSlide>
      </Root>
    );
    const presentation = screen.getByLabelText(presentationLabel, {
      selector: "main, div",
    });
    vi.spyOn(presentation, "clientWidth", "get").mockReturnValue(frame.width);
    vi.spyOn(presentation, "clientHeight", "get").mockReturnValue(frame.height);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Show slide previews" })
      )
    );

    const dialog = screen.getByRole("dialog", { name: "Slide previews" });
    const previewContent = within(dialog).getByText("First slide");
    const canvas = previewContent.closest("[style*='scale(']");
    expect(canvas).toBeInstanceOf(HTMLElement);
    if (!(canvas instanceof HTMLElement)) {
      return;
    }
    const scale = Number(canvas.style.transform.match(/scale\((.+)\)/)?.[1]);
    expect(Number.parseFloat(canvas.style.width) * scale).toBeCloseTo(176);
    expect(Number.parseFloat(canvas.style.height) * scale).toBeCloseTo(99);
    expect(previewContent.style.background).toBe(
      "linear-gradient(90deg, indigo, coral)"
    );
  });

  it("keeps the fixed trigger hidden while the drawer is sliding closed", async () => {
    motionStyle.remove();
    render(
      <Root>
        <DeckSlide>First</DeckSlide>
        <DeckSlide>Last</DeckSlide>
      </Root>
    );
    const presentation = screen.getByLabelText(presentationLabel, {
      selector: "main, div",
    });
    const opener = screen.getByRole("button", { name: "Show slide previews" });
    fireEvent.mouseMove(presentation, { clientX: 40 });
    expect(opener.classList.contains("opacity-100")).toBe(true);
    await act(async () => fireEvent.click(opener));
    const dialog = screen.getByRole("dialog", { name: "Slide previews" });
    await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));

    expect(dialog.getAttribute("data-state")).toBe("closed");
    expect(dialog.isConnected).toBe(true);
    expect(opener.classList.contains("opacity-0")).toBe(true);
    expect(opener.tabIndex).toBe(-1);
  });

  it("keeps the active slide's state when opening and closing the drawer and returns focus", async () => {
    render(
      <Root>
        <DeckSlide>
          <Counter />
        </DeckSlide>
        <DeckSlide>Second slide</DeckSlide>
      </Root>
    );
    fireEvent.click(screen.getByRole("button", { name: "Count: 0" }));
    const opener = screen.getByRole("button", { name: "Show slide previews" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => fireEvent.click(opener));

    const dialog = screen.getByRole("dialog", { name: "Slide previews" });
    expect(
      within(dialog)
        .getByRole("button", { name: "Go to slide 1" })
        .getAttribute("aria-current")
    ).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () =>
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Close slide previews" })
      )
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.getByRole("button", { name: "Count: 1" })).toBeTruthy();
  });

  it("preserves live object and callback refs when previewing nested and forwarded content", async () => {
    const contentRef = createRef<HTMLDivElement>();
    const forwardedRef = createRef<HTMLDivElement>();
    const iterableRef = createRef<HTMLDivElement>();
    const callbackRef = vi.fn<(node: HTMLDivElement | null) => void>();
    render(
      <Root>
        <DeckSlide>
          <>
            <div ref={contentRef}>
              <div ref={callbackRef}>Nested content</div>
              <Button asChild>
                <a href="#example">Single child link</a>
              </Button>
            </div>
            <ForwardedContent ref={forwardedRef} />
            {
              new Set([
                <div key="iterable-content" ref={iterableRef}>
                  Iterable content
                </div>,
              ])
            }
          </>
        </DeckSlide>
        <DeckSlide>Last slide</DeckSlide>
      </Root>
    );
    const liveContent = contentRef.current;
    const liveForwardedContent = forwardedRef.current;
    const liveIterableContent = iterableRef.current;
    expect(liveContent).not.toBeNull();
    expect(liveForwardedContent).not.toBeNull();
    expect(liveIterableContent).not.toBeNull();
    expect(callbackRef).toHaveBeenCalledTimes(1);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Show slide previews" })
      )
    );
    const dialog = screen.getByRole("dialog", { name: "Slide previews" });
    expect(within(dialog).getByText("Nested content")).toBeTruthy();
    expect(within(dialog).getByText("Forwarded content")).toBeTruthy();
    expect(within(dialog).getByText("Iterable content")).toBeTruthy();
    expect(within(dialog).getByText("Single child link")).toBeTruthy();
    expect(contentRef.current).toBe(liveContent);
    expect(forwardedRef.current).toBe(liveForwardedContent);
    expect(iterableRef.current).toBe(liveIterableContent);
    expect(callbackRef).toHaveBeenCalledTimes(1);
    await act(async () =>
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Close slide previews" })
      )
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(contentRef.current).toBe(liveContent);
    expect(forwardedRef.current).toBe(liveForwardedContent);
    expect(iterableRef.current).toBe(liveIterableContent);
    expect(callbackRef).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on the close button when navigating from outside the preview list", async () => {
    render(
      <Root>
        <DeckSlide>First</DeckSlide>
        <DeckSlide>Last</DeckSlide>
      </Root>
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Show slide previews" })
      )
    );
    const dialog = screen.getByRole("dialog", { name: "Slide previews" });
    const closeButton = within(dialog).getByRole("button", {
      name: "Close slide previews",
    });
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: "ArrowRight" });
    expect(
      within(dialog)
        .getByRole("button", { name: "Go to slide 2" })
        .getAttribute("aria-current")
    ).toBe("true");
    expect(document.activeElement).toBe(closeButton);
  });

  it("jumps to a numbered slide, follows keyboard navigation, and closes with Escape", async () => {
    render(
      <Root>
        {Array.from({ length: 12 }, (_, index) => (
          <DeckSlide key={index}>
            <h1>Page {index + 1}</h1>
          </DeckSlide>
        ))}
      </Root>
    );
    const opener = screen.getByRole("button", { name: "Show slide previews" });
    await act(async () => fireEvent.click(opener));
    const dialog = screen.getByRole("dialog", { name: "Slide previews" });
    expect(
      within(dialog).getAllByRole("button", { name: /^Go to slide/ })
    ).toHaveLength(12);
    const clickedSlide = within(dialog).getByRole("button", {
      name: "Go to slide 12",
    });
    clickedSlide.focus();
    fireEvent.click(clickedSlide);
    expect(clickedSlide.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(clickedSlide, { key: "PageUp" });
    const previousSlide = within(dialog).getByRole("button", {
      name: "Go to slide 11",
    });
    expect(previousSlide.getAttribute("aria-current")).toBe("true");
    expect(clickedSlide.getAttribute("aria-current")).toBeNull();
    expect(document.activeElement).toBe(previousSlide);
    fireEvent.keyDown(previousSlide, { key: "ArrowRight" });
    expect(document.activeElement).toBe(clickedSlide);
    fireEvent.keyDown(clickedSlide, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(previousSlide);
    await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "Page 11" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

it.each([
  176, 129.5,
])("scales a preview to a %s pixel thumbnail and keeps it inert", (width) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, width, (width * 9) / 16)
  );
  const { container } = render(
    <SlideThumbnail slide={<button type="button">Slide content</button>} />
  );
  const thumbnail = container.firstElementChild;
  const canvas = thumbnail?.firstElementChild;
  expect(thumbnail).toBeInstanceOf(HTMLElement);
  expect(canvas).toBeInstanceOf(HTMLElement);
  if (!(thumbnail instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
    return;
  }
  const scale = Number(canvas.style.transform.match(/scale\((.+)\)/)?.[1]);
  expect(Number.parseFloat(canvas.style.width) * scale).toBeCloseTo(width);
  expect(Number.parseFloat(canvas.style.height) * scale).toBeCloseTo(
    (width * 9) / 16
  );
  expect(thumbnail.inert).toBe(true);
  expect(screen.queryByRole("button", { name: "Slide content" })).toBeNull();
});

it("keeps grid controls and duplicate previews out of PDF exports", () => {
  render(
    <VizContext.Provider value={{ isPdfMode: true, editText: null }}>
      <Slideshow>
        <Slide>First</Slide>
        <Slide>Last</Slide>
      </Slideshow>
    </VizContext.Provider>
  );
  expect(
    screen.queryByRole("button", { name: "Show slide previews" })
  ).toBeNull();
  expect(screen.getAllByText("First")).toHaveLength(1);
  expect(screen.getAllByText("Last")).toHaveLength(1);
});
