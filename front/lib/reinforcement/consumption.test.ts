import {
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import {
  getCurrentPeriodStart,
  getReinforcementMonthlyCapMicroUsd,
  getSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import type { LightWorkspaceType } from "@app/types/user";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeWorkspace(metadata?: {
  reinforcementCapMicroUsd?: number;
  selfImprovementCapPerSkillMicroUsd?: number;
}): LightWorkspaceType {
  return { sId: "ws-1", metadata: metadata ?? null } as LightWorkspaceType;
}

describe("getReinforcementMonthlyCapMicroUsd", () => {
  it("returns default cap when workspace has no metadata", () => {
    expect(getReinforcementMonthlyCapMicroUsd(makeWorkspace())).toBe(
      DEFAULT_REINFORCEMENT_CAP_MICRO_USD
    );
  });

  it("returns default cap when metadata has no reinforcementCapMicroUsd", () => {
    expect(getReinforcementMonthlyCapMicroUsd(makeWorkspace({}))).toBe(
      DEFAULT_REINFORCEMENT_CAP_MICRO_USD
    );
  });

  it("returns workspace override when set", () => {
    expect(
      getReinforcementMonthlyCapMicroUsd(
        makeWorkspace({ reinforcementCapMicroUsd: 50_000_000 })
      )
    ).toBe(50_000_000);
  });

  it("allows cap of 0", () => {
    expect(
      getReinforcementMonthlyCapMicroUsd(
        makeWorkspace({ reinforcementCapMicroUsd: 0 })
      )
    ).toBe(0);
  });
});

describe("getSelfImprovementCapPerSkillMicroUsd", () => {
  it("returns default cap when workspace has no metadata", () => {
    expect(getSelfImprovementCapPerSkillMicroUsd(makeWorkspace())).toBe(
      DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD
    );
  });

  it("returns default cap when metadata has no selfImprovementCapPerSkillMicroUsd", () => {
    expect(getSelfImprovementCapPerSkillMicroUsd(makeWorkspace({}))).toBe(
      DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD
    );
  });

  it("returns workspace override when set", () => {
    expect(
      getSelfImprovementCapPerSkillMicroUsd(
        makeWorkspace({ selfImprovementCapPerSkillMicroUsd: 10_000_000 })
      )
    ).toBe(10_000_000);
  });

  it("allows cap of 0", () => {
    expect(
      getSelfImprovementCapPerSkillMicroUsd(
        makeWorkspace({ selfImprovementCapPerSkillMicroUsd: 0 })
      )``
    ).toBe(0);
  });
});

describe("getCurrentPeriodStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first day of the current month at 00:00 UTC", () => {
    vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });

  it("returns the same instant when invoked at the start of a month", () => {
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2026-04-01T00:00:00.000Z"
    );
  });

  it("uses UTC, not local time, when computing the month boundary", () => {
    // 2026-04-01T01:30 in a UTC+2 zone is still 2026-03-31T23:30 UTC, so the
    // current period must be March, not April.
    vi.setSystemTime(new Date("2026-03-31T23:30:00.000Z"));
    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });
});

describe("getCurrentPeriodStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the first day of the current month at 00:00 UTC", () => {
    vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });

  it("returns the same instant when invoked at the start of a month", () => {
    vi.setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2026-04-01T00:00:00.000Z"
    );
  });

  it("uses UTC, not local time, when computing the month boundary", () => {
    // 2026-04-01T01:30 in a UTC+2 zone is still 2026-03-31T23:30 UTC, so the
    // current period must be March, not April.
    vi.setSystemTime(new Date("2026-03-31T23:30:00.000Z"));
    expect(getCurrentPeriodStart().toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });
});
