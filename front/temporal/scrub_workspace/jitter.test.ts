import {
  getWorkspaceScrubJitterMinutes,
  WORKSPACE_SCRUB_JITTER_MAX_HOURS,
} from "@app/temporal/scrub_workspace/jitter";
import { describe, expect, it } from "vitest";

const MINUTES_PER_HOUR = 60;
const SAMPLE_WORKSPACE_COUNT = 10;

describe("getWorkspaceScrubJitterMinutes", () => {
  it("is deterministic", () => {
    expect(getWorkspaceScrubJitterMinutes("w123")).toBe(
      getWorkspaceScrubJitterMinutes("w123")
    );
  });

  it("returns a delay in the configured jitter window", () => {
    const maxJitterMinutes =
      WORKSPACE_SCRUB_JITTER_MAX_HOURS * MINUTES_PER_HOUR;

    for (const workspaceId of ["w1", "w123", "w-longer-workspace-id"]) {
      const jitterMinutes = getWorkspaceScrubJitterMinutes(workspaceId);

      expect(jitterMinutes).toBeGreaterThanOrEqual(0);
      expect(jitterMinutes).toBeLessThan(maxJitterMinutes);
    }
  });

  it("spreads nearby workspace IDs", () => {
    const jitters = new Set(
      Array.from({ length: SAMPLE_WORKSPACE_COUNT }, (_, index) =>
        getWorkspaceScrubJitterMinutes(`w${index}`)
      )
    );

    expect(jitters.size).toBeGreaterThan(1);
  });
});
