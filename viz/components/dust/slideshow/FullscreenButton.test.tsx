// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { VizContext } from "@viz/app/components/VizContext";
import {
  Slide as LegacySlide,
  Slideshow as LegacySlideshow,
} from "@viz/components/dust/slideshow/v1";
import { Slide, Slideshow } from "@viz/components/dust/slideshow/v2";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFullscreen(container: HTMLElement) {
  const request = vi.fn(async () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: container,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  const exit = vi.fn(async () => {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  Object.defineProperty(container, "requestFullscreen", {
    configurable: true,
    value: request,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exit,
  });
  return { request, exit };
}

const versions = [
  { name: "v2", Root: Slideshow, Slide, presentationLabel: "Slideshow" },
  {
    name: "v1",
    Root: LegacySlideshow.Root,
    Slide: LegacySlide,
    presentationLabel: "Slide 1 of 2",
  },
];

describe.each(versions)("$name fullscreen", ({
  Root,
  Slide: DeckSlide,
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

  it("keeps slide state and navigation when entering, exiting, and leaving via the browser", async () => {
    render(
      <Root>
        <DeckSlide>
          <Counter />
        </DeckSlide>
        <DeckSlide>
          <h1>Second slide</h1>
        </DeckSlide>
      </Root>
    );
    const presentation = screen.getByLabelText(presentationLabel, {
      selector: "main, div",
    });
    const controls = within(presentation);
    const { request, exit } = mockFullscreen(presentation);

    fireEvent.click(controls.getByRole("button", { name: "Count: 0" }));
    await act(async () =>
      fireEvent.click(
        controls.getByRole("button", { name: "Enter fullscreen" })
      )
    );
    expect(request).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(controls.getByRole("button", { name: "Count: 1" })).toBeTruthy();
    await act(async () =>
      fireEvent.click(controls.getByRole("button", { name: "Exit fullscreen" }))
    );
    expect(exit).toHaveBeenCalledOnce();
    expect(controls.getByRole("button", { name: "Count: 1" })).toBeTruthy();

    await act(async () =>
      fireEvent.click(
        controls.getByRole("button", { name: "Enter fullscreen" })
      )
    );
    fireEvent.click(controls.getByRole("button", { name: "Next slide" }));
    expect(
      controls.getByRole("heading", { name: "Second slide" })
    ).toBeTruthy();
    expect(document.fullscreenElement).toBe(presentation);
    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(
      controls
        .getByRole("button", { name: "Enter fullscreen" })
        .getAttribute("aria-pressed")
    ).toBe("false");
    expect(
      controls.getByRole("heading", { name: "Second slide" })
    ).toBeTruthy();
  });
});

it("disables unsupported fullscreen", () => {
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: false,
  });
  render(
    <Slideshow>
      <Slide>First</Slide>
      <Slide>Last</Slide>
    </Slideshow>
  );
  expect(
    screen
      .getByRole("button", { name: "Enter fullscreen" })
      .hasAttribute("disabled")
  ).toBe(true);
});

it("keeps navigation usable after a rejected fullscreen request", async () => {
  render(
    <Slideshow>
      <Slide>First</Slide>
      <Slide>Last</Slide>
    </Slideshow>
  );
  const presentation = screen.getByLabelText("Slideshow");
  Object.defineProperty(presentation, "requestFullscreen", {
    configurable: true,
    value: vi.fn().mockRejectedValue(new TypeError("Permission denied")),
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" }))
  );
  expect(within(presentation).getByRole("alert").textContent).toContain(
    "Please try again"
  );
  expect(
    screen
      .getByRole("button", { name: "Enter fullscreen" })
      .hasAttribute("disabled")
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
  expect(screen.getByText("Last")).toBeTruthy();
});

it("offers fullscreen for a single slide and excludes the controls from PDF export", () => {
  const { container, rerender } = render(
    <Slideshow>
      <Slide>Only slide</Slide>
    </Slideshow>
  );
  expect(screen.getByRole("button", { name: "Enter fullscreen" })).toBeTruthy();
  rerender(
    <VizContext.Provider
      value={{ isPdfMode: true, editText: null, addEventListener: null }}
    >
      <Slideshow className="pdf-deck">
        <Slide>First</Slide>
        <Slide>Last</Slide>
      </Slideshow>
    </VizContext.Provider>
  );
  const pages = container.querySelectorAll(".pdf-deck > div");
  expect(Array.from(pages, (page) => page.textContent)).toEqual([
    "First",
    "Last",
  ]);
  expect(pages[0].getAttribute("style")).toContain("break-after: page");
  expect(pages[1].getAttribute("style")).toContain("break-after: auto");
  expect(screen.queryByRole("button", { name: "Enter fullscreen" })).toBeNull();
});
