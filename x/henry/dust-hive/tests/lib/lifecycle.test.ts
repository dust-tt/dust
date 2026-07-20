import { describe, expect, it } from "bun:test";
import { getLifecycleRunOnceOptions } from "../../src/commands/lifecycle";
import { getEligibleLifecycleTransition, type LifecycleState } from "../../src/lib/lifecycle";
import type { LifecyclePolicy } from "../../src/lib/lifecycle-config";

const policy: LifecyclePolicy = {
  coldAfterSeconds: 60,
  stopAfterSeconds: 120,
  deleteAfterSeconds: 300,
  trackSourceChanges: true,
  trackFrontend: true,
  blockDeleteIfSessionExists: true,
};

function state(overrides: Partial<LifecycleState> = {}): LifecycleState {
  return {
    observedState: "warm",
    stateEnteredAt: "2026-01-01T00:00:00.000Z",
    lastActivityAt: "2026-01-01T00:00:00.000Z",
    lastActivitySource: "initial",
    sourceFingerprint: "fingerprint",
    blockedReason: null,
    ...overrides,
  };
}

describe("lifecycle transitions", () => {
  it("cools a warm environment after its idle delay", () => {
    expect(
      getEligibleLifecycleTransition(state(), policy, Date.parse("2026-01-01T00:01:00.000Z"))
    ).toBe("cool");
  });

  it("uses the state entry time when it is newer than activity", () => {
    const lifecycleState = state({
      observedState: "cold",
      stateEnteredAt: "2026-01-01T01:00:00.000Z",
    });
    expect(
      getEligibleLifecycleTransition(lifecycleState, policy, Date.parse("2026-01-01T01:01:59.000Z"))
    ).toBeNull();
    expect(
      getEligibleLifecycleTransition(lifecycleState, policy, Date.parse("2026-01-01T01:02:00.000Z"))
    ).toBe("stop");
  });

  it("resets the timer when activity happens in the current state", () => {
    const lifecycleState = state({
      observedState: "stopped",
      lastActivityAt: "2026-01-01T03:00:00.000Z",
    });
    expect(
      getEligibleLifecycleTransition(lifecycleState, policy, Date.parse("2026-01-01T03:04:59.000Z"))
    ).toBeNull();
    expect(
      getEligibleLifecycleTransition(lifecycleState, policy, Date.parse("2026-01-01T03:05:00.000Z"))
    ).toBe("delete");
  });

  it("supports disabling individual transitions", () => {
    expect(
      getEligibleLifecycleTransition(
        state(),
        { ...policy, coldAfterSeconds: null },
        Date.parse("2026-01-02T00:00:00.000Z")
      )
    ).toBeNull();
  });
});

describe("lifecycle sweep options", () => {
  it("leaves configured dry-run mode authoritative when the flag is absent", () => {
    expect(getLifecycleRunOnceOptions()).toEqual({});
    expect(getLifecycleRunOnceOptions(true)).toEqual({ dryRun: true });
  });
});
