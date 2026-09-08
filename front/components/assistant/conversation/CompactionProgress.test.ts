import {
  CompactionProgress,
  getCompactionFill,
  getCompactionProgressTier,
} from "@app/components/assistant/conversation/CompactionProgress";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

describe("getCompactionFill", () => {
  it("fits the typical and rare durations", () => {
    expect(getCompactionFill(90)).toBeCloseTo(85);
    expect(getCompactionFill(270)).toBeCloseTo(97);
  });

  it("approaches 99 without reaching it", () => {
    expect(getCompactionFill(0)).toBe(0);
    expect(getCompactionFill(10_000)).toBeLessThan(99);
    expect(getCompactionFill(10_000)).toBeGreaterThan(98);
  });
});

describe("getCompactionProgressTier", () => {
  it("changes tiers at the expected durations", () => {
    expect(getCompactionProgressTier(89)).toBe("normal");
    expect(getCompactionProgressTier(90)).toBe("past-typical");
    expect(getCompactionProgressTier(149)).toBe("past-typical");
    expect(getCompactionProgressTier(150)).toBe("slow");
    expect(getCompactionProgressTier(269)).toBe("slow");
    expect(getCompactionProgressTier(270)).toBe("tail");
  });
});

describe("CompactionProgress", () => {
  it("shows 100% when a compaction succeeds", () => {
    render(
      createElement(CompactionProgress, {
        message: { created: Date.now(), status: "succeeded" },
        canRetry: true,
        isRetrying: false,
        onRetry: vi.fn(),
      })
    );

    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100"
    );
    expect(
      screen.getByText("The conversation is compacted. You can keep going.")
    ).toBeDefined();
  });
});
