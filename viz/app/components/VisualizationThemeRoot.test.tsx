// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { VizContext } from "@viz/app/components/VizContext";
import { FrameRoot } from "@viz/components/dust/frame";
import { Slideshow } from "@viz/components/dust/slideshow/v2";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  window.history.replaceState(null, "", "/content?theme=dark");
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  window.history.replaceState(null, "", "/");
});

describe.each([
  { name: "FrameRoot", Root: FrameRoot, NestedRoot: Slideshow },
  { name: "Slideshow", Root: Slideshow, NestedRoot: FrameRoot },
])("$name host theme", ({ Root, NestedRoot }) => {
  it("keeps light defaults without a theme prop", () => {
    render(<Root>Legacy content</Root>, { wrapper: StrictMode });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it.each([
    ["/content?theme=dark", false, "dark"],
    ["/content?theme=light", false, "light"],
    ["/content", false, "light"],
    ["/content?theme=invalid", false, "light"],
    ["/content?theme=dark&pdfMode=true", true, "light"],
  ] as const)("opts into %s with PDF mode %s and renders %s", (url, isPdfMode, expectedTheme) => {
    window.history.replaceState(null, "", url);
    const context = { isPdfMode, editText: null };
    render(
      <VizContext.Provider value={context}>
        <Root theme={{}}>Themed content</Root>
      </VizContext.Provider>,
      { wrapper: StrictMode }
    );

    expect(document.documentElement.classList.contains("dark")).toBe(
      expectedTheme === "dark"
    );
    expect(document.documentElement.style.colorScheme).toBe(expectedTheme);
  });

  it("updates the document when the outer theme is added or removed", () => {
    const { rerender, unmount } = render(<Root>Content</Root>, {
      wrapper: StrictMode,
    });

    rerender(<Root theme={{ "--primary": "rebeccapurple" }}>Content</Root>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    rerender(<Root theme={undefined}>Content</Root>);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    rerender(<Root theme={{}}>Content</Root>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    unmount();
    render(<div>Legacy content replacing the themed Frame</div>);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("keeps nested theme overrides from opting a light document into dark mode", () => {
    const { rerender } = render(
      <Root>
        <NestedRoot theme={{ "--primary": "rebeccapurple" }}>
          Nested content
        </NestedRoot>
      </Root>,
      { wrapper: StrictMode }
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    rerender(
      <Root>
        <NestedRoot theme={{}}>Nested content</NestedRoot>
      </Root>
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("keeps an unthemed nested root from resetting an opted-in document", () => {
    const { rerender } = render(
      <Root theme={{}}>
        <NestedRoot>Nested content</NestedRoot>
      </Root>,
      { wrapper: StrictMode }
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    rerender(<Root theme={{}}>Content without the nested root</Root>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
