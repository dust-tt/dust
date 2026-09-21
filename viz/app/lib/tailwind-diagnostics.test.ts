// @vitest-environment jsdom

import { observeMissingTailwindClasses } from "@viz/app/lib/tailwind-diagnostics";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("missing Tailwind usage", () => {
  it("records dropped classes once across initial content, nested additions, and class changes", async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<div class="bg-opacity-80 bg-black/80 custom-class"></div>';
    const report = vi.fn();
    const stop = observeMissingTailwindClasses(
      document.body,
      ["bg-opacity-80", "text-opacity-50", "blur-0"],
      report
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(report).toHaveBeenCalledExactlyOnceWith(["bg-opacity-80"]);

    const nested = document.createElement("section");
    nested.innerHTML = '<span class="text-opacity-50 bg-opacity-80"></span>';
    document.body.appendChild(nested);
    nested.className = "blur-0";
    await vi.advanceTimersByTimeAsync(250);
    expect(report).toHaveBeenLastCalledWith(["blur-0", "text-opacity-50"]);
    nested.className = "bg-opacity-80";
    await vi.advanceTimersByTimeAsync(250);
    expect(report).toHaveBeenCalledTimes(2);
    stop();
  });

  it("cancels queued reports and stops observing on cleanup", async () => {
    vi.useFakeTimers();
    document.body.className = "bg-opacity-80";
    const report = vi.fn();
    const stop = observeMissingTailwindClasses(
      document.body,
      ["bg-opacity-80"],
      report
    );
    stop();
    document.body.className = "";
    document.body.className = "bg-opacity-80";
    await vi.advanceTimersByTimeAsync(500);
    expect(report).not.toHaveBeenCalled();
    document.body.className = "";
  });

  it("bounds each diagnostic message", async () => {
    vi.useFakeTimers();
    const classes = Array.from(
      { length: 120 },
      (_, index) => `missing-${index}`
    );
    document.body.innerHTML = `<div class="${classes.join(" ")}"></div>`;
    const report = vi.fn();
    const stop = observeMissingTailwindClasses(document.body, classes, report);
    await vi.advanceTimersByTimeAsync(250);
    expect(report.mock.calls.map(([batch]) => batch.length)).toEqual([
      50, 50, 20,
    ]);
    stop();
  });
});
