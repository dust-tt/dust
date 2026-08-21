import {
  applyActivationNudgePerRunCap,
  DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN,
} from "@app/temporal/activation_scheduler/config";
import { describe, expect, it } from "vitest";

describe("applyActivationNudgePerRunCap", () => {
  const items = Array.from(
    { length: DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN + 3 },
    (_, i) => i
  );

  it("slices to the per-run cap", () => {
    expect(
      applyActivationNudgePerRunCap(items, { overrideChecks: false })
    ).toEqual(items.slice(0, DEFAULT_ACTIVATION_NUDGE_MAX_USERS_PER_RUN));
  });

  it("does not slice when overrideChecks is set", () => {
    expect(
      applyActivationNudgePerRunCap(items, { overrideChecks: true })
    ).toEqual(items);
  });
});
