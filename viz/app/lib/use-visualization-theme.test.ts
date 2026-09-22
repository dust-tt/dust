// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { useVisualizationTheme } from "@viz/app/lib/use-visualization-theme";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  window.history.replaceState(null, "", "/");
});

describe("Frame theme", () => {
  it.each([
    ["/content?theme=dark", false, "dark"],
    ["/content?theme=light", false, "light"],
    ["/content", false, "light"],
    ["/content?theme=invalid", false, "light"],
    ["/content?theme=dark&pdfMode=true", true, "light"],
  ] as const)("renders %s in %s PDF mode with %s colors", (url, isPdfMode, theme) => {
    window.history.replaceState(null, "", url);
    renderHook(() => useVisualizationTheme(isPdfMode));
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(theme === "dark");
    expect(root.style.colorScheme).toBe(theme);
  });
});
