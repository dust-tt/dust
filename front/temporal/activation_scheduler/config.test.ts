import {
  applyActivationNudgePerRunCap,
  DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN,
} from "@app/temporal/activation_scheduler/config";
import { describe, expect, it } from "vitest";

describe("applyActivationNudgePerRunCap", () => {
  it("keeps the pods that have gone the longest without a nudge", () => {
    const neverNudged = Array.from(
      { length: DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN },
      (_, i) => ({ id: `never-${i}`, lastNudgedAtMs: null })
    );
    const recentlyNudged = [
      { id: "recent-a", lastNudgedAtMs: 3_000 },
      { id: "recent-b", lastNudgedAtMs: 2_000 },
      { id: "oldest", lastNudgedAtMs: 1_000 },
    ];

    const capped = applyActivationNudgePerRunCap(
      [...recentlyNudged, ...neverNudged],
      { overrideChecks: false }
    );

    expect(capped).toHaveLength(DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN);
    expect(capped.map((item) => item.id)).toEqual(
      neverNudged.map((item) => item.id)
    );
  });

  it("prefers the oldest last-nudge when every pod has been nudged", () => {
    const items = Array.from(
      { length: DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN + 3 },
      (_, i) => ({ id: i, lastNudgedAtMs: 10_000 - i })
    );

    const capped = applyActivationNudgePerRunCap(items, {
      overrideChecks: false,
    });

    expect(capped.map((item) => item.id)).toEqual(
      items
        .slice()
        .sort((a, b) => a.lastNudgedAtMs - b.lastNudgedAtMs)
        .slice(0, DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN)
        .map((item) => item.id)
    );
  });

  it("does not slice when overrideChecks is set", () => {
    const items = Array.from(
      { length: DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN + 3 },
      (_, i) => ({ id: i, lastNudgedAtMs: i })
    );

    expect(
      applyActivationNudgePerRunCap(items, { overrideChecks: true })
    ).toEqual(items);
  });
});
