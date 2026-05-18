import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  getMaxConversationsForBudget,
} from "@app/lib/reinforcement/constants";
import { describe, expect, it } from "vitest";

// Large value so programmatic credits are not the limiting factor by default.
const UNLIMITED_PROGRAMMATIC = 999_999_999;

describe("getMaxConversationsForBudget", () => {
  it("returns 0 when reinforcement consumption equals cap", () => {
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 100_000_000,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: UNLIMITED_PROGRAMMATIC,
      })
    ).toBe(0);
  });

  it("returns 0 when reinforcement consumption exceeds cap", () => {
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 110_000_000,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: UNLIMITED_PROGRAMMATIC,
      })
    ).toBe(0);
  });

  it("returns budget-based count for small remaining reinforcement budget", () => {
    // $1 remaining = 1_000_000 microUSD → 10 conversations at $0.10 each.
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 99_000_000,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: UNLIMITED_PROGRAMMATIC,
      })
    ).toBe(10);
  });

  it("floors partial conversation budgets", () => {
    // $0.15 remaining = 150_000 microUSD → 1 conversation (floor of 1.5).
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 99_850_000,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: UNLIMITED_PROGRAMMATIC,
      })
    ).toBe(1);
  });

  it("returns 0 when remaining budget is less than one conversation", () => {
    // $0.05 remaining = 50_000 microUSD → 0 conversations.
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 99_950_000,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: UNLIMITED_PROGRAMMATIC,
      })
    ).toBe(0);
  });

  it("caps at DEFAULT_MAX_CONVERSATIONS_PER_RUN when budget is large", () => {
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 0,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: UNLIMITED_PROGRAMMATIC,
      })
    ).toBe(DEFAULT_MAX_CONVERSATIONS_PER_RUN);
  });

  it("uses programmatic credits as limit when lower than reinforcement budget", () => {
    // $0.50 remaining programmatic credits → 5 conversations.
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 0,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: 500_000,
      })
    ).toBe(5);
  });

  it("returns 0 when programmatic credits are exhausted", () => {
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 0,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: 0,
      })
    ).toBe(0);
  });

  it("picks the most restrictive limit between reinforcement and programmatic", () => {
    // Reinforcement remaining: $2 → 20 conversations.
    // Programmatic remaining: $1 → 10 conversations.
    // Should pick 10.
    expect(
      getMaxConversationsForBudget({
        globalConsumptionMicroUsd: 98_000_000,
        globalCapMicroUsd: 100_000_000,
        remainingProgrammaticCreditsMicroUsd: 1_000_000,
      })
    ).toBe(10);
  });
});
