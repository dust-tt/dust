import {
  hasCrossedCreditSpendCheckpoint,
  hasReachedCreditSpendCheckpoint,
  isExemptFromCreditSpendCheckpoint,
} from "@app/lib/api/assistant/credit_spend_checkpoint";
import type { Authenticator } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import { describe, expect, it } from "vitest";

// Minimal stand-in for the Authenticator class exposing only the members the checkpoint logic
// reads. A class instance can't be constructed structurally, so a single `as unknown as` is the
// standard test-mock escape here (see the same pattern across the suite); the cast surface is
// kept to this one spot.
function makeAuth({
  hasUser = true,
}: {
  hasUser?: boolean;
} = {}): Authenticator {
  return {
    user: () => (hasUser ? { sId: "user_test" } : null),
  } as unknown as Authenticator;
}

describe("isExemptFromCreditSpendCheckpoint", () => {
  it("is exempt when there is no user to answer the pause", () => {
    const auth = makeAuth({ hasUser: false });
    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: "web" })
    ).toBe(true);
  });

  it("is exempt when the origin is unknown", () => {
    const auth = makeAuth({ hasUser: true });
    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: null })
    ).toBe(true);
  });

  it.each([
    "api",
    "email",
    "slack",
    "triggered",
    "wakeup",
    "transcript",
    "zendesk",
    "project_kickoff",
    "cli",
  ] as const)("is exempt for %s: the author cannot resume the pause from a Dust client", (origin) => {
    const auth = makeAuth({ hasUser: true });
    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: origin })
    ).toBe(true);
  });

  it.each([
    "web",
    "extension",
  ] as const)("is not exempt for %s: the author is in a Dust client UI", (origin) => {
    const auth = makeAuth({ hasUser: true });
    expect(
      isExemptFromCreditSpendCheckpoint(auth, { userMessageOrigin: origin })
    ).toBe(false);
  });
});

describe("hasReachedCreditSpendCheckpoint", () => {
  const thresholdMicroUsd =
    CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS *
    MODEL_COST_MICRO_USD_PER_AWU_CREDIT;

  it("is false while the spend is below the threshold", () => {
    expect(
      hasReachedCreditSpendCheckpoint({
        totalCostMicroUsd:
          thresholdMicroUsd - MODEL_COST_MICRO_USD_PER_AWU_CREDIT,
      })
    ).toBe(false);
  });

  it("is true once the spend reaches the threshold", () => {
    expect(
      hasReachedCreditSpendCheckpoint({ totalCostMicroUsd: thresholdMicroUsd })
    ).toBe(true);
  });
});

describe("hasCrossedCreditSpendCheckpoint", () => {
  it("is false when exempt, whatever the status", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: true,
        isRootAgentMessage: true,
        status: null,
      })
    ).toBe(false);
  });

  it("is false for a sub-agent message, whatever the status", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: false,
        status: null,
      })
    ).toBe(false);
  });

  it("is false once acknowledged", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: "acknowledged",
      })
    ).toBe(false);
  });

  it("is true for a pausable root message with no prior status", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: null,
      })
    ).toBe(true);
  });

  it("is true for a pausable root message already flagged paused", () => {
    expect(
      hasCrossedCreditSpendCheckpoint({
        isExempt: false,
        isRootAgentMessage: true,
        status: "paused",
      })
    ).toBe(true);
  });
});
