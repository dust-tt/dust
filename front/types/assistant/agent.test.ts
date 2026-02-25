import { describe, expect, it } from "vitest";

import { clampReasoningEffort } from "./agent";

describe("clampReasoningEffort", () => {
  it("returns effort unchanged when within range", () => {
    expect(clampReasoningEffort("medium", "none", "high")).toBe("medium");
  });

  it("clamps above maximum down", () => {
    expect(clampReasoningEffort("high", "none", "medium")).toBe("medium");
  });

  it("clamps below minimum up", () => {
    expect(clampReasoningEffort("none", "light", "high")).toBe("light");
  });

  it("returns the only valid value when min === max", () => {
    expect(clampReasoningEffort("high", "medium", "medium")).toBe("medium");
    expect(clampReasoningEffort("none", "medium", "medium")).toBe("medium");
  });

  it("handles boundary values (effort === min or max)", () => {
    expect(clampReasoningEffort("light", "light", "high")).toBe("light");
    expect(clampReasoningEffort("high", "light", "high")).toBe("high");
  });
});
