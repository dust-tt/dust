import type { Authenticator } from "@app/lib/auth";
import * as metronomeContracts from "@app/lib/metronome/contracts";
import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import {
  DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS,
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import {
  getReinforcementMonthlyCapAwuCredits,
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeAuth({
  hasWorkspace = false,
}: {
  hasWorkspace?: boolean;
} = {}): Authenticator {
  return {
    workspace: () => (hasWorkspace ? { sId: "ws-1" } : null),
  } as unknown as Authenticator;
}

function makeWorkspace(metadata?: {
  reinforcementCapMicroUsd?: number;
  selfImprovementCapPerSkillMicroUsd?: number;
  reinforcementCapAwuCredits?: number;
  selfImprovementCapPerSkillAwuCredits?: number;
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

describe("getReinforcementMonthlyCapAwuCredits", () => {
  it("returns default cap when workspace has no metadata", () => {
    expect(getReinforcementMonthlyCapAwuCredits(makeWorkspace())).toBe(
      DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS
    );
  });

  it("returns default cap when metadata has no reinforcementCapAwuCredits", () => {
    expect(getReinforcementMonthlyCapAwuCredits(makeWorkspace({}))).toBe(
      DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS
    );
  });

  it("ignores the microUSD override", () => {
    expect(
      getReinforcementMonthlyCapAwuCredits(
        makeWorkspace({ reinforcementCapMicroUsd: 50_000_000 })
      )
    ).toBe(DEFAULT_REINFORCEMENT_CAP_AWU_CREDITS);
  });

  it("returns workspace override when set", () => {
    expect(
      getReinforcementMonthlyCapAwuCredits(
        makeWorkspace({ reinforcementCapAwuCredits: 5_000 })
      )
    ).toBe(5_000);
  });

  it("allows cap of 0", () => {
    expect(
      getReinforcementMonthlyCapAwuCredits(
        makeWorkspace({ reinforcementCapAwuCredits: 0 })
      )
    ).toBe(0);
  });
});

describe("getSelfImprovementCapPerSkillMicroUsd", () => {
  it("returns default cap when workspace has no metadata", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(makeWorkspace())
    ).toBe(DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD);
  });

  it("returns default cap when metadata has no selfImprovementCapPerSkillMicroUsd", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(makeWorkspace({}))
    ).toBe(DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD);
  });

  it("returns workspace override when set", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(
        makeWorkspace({ selfImprovementCapPerSkillMicroUsd: 10_000_000 })
      )
    ).toBe(10_000_000);
  });

  it("allows cap of 0", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd(
        makeWorkspace({ selfImprovementCapPerSkillMicroUsd: 0 })
      )
    ).toBe(0);
  });
});

describe("getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits", () => {
  it("returns default cap when workspace has no metadata", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(makeWorkspace())
    ).toBe(DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS);
  });

  it("returns default cap when metadata has no selfImprovementCapPerSkillAwuCredits", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(makeWorkspace({}))
    ).toBe(DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS);
  });

  it("ignores the microUSD override", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(
        makeWorkspace({ selfImprovementCapPerSkillMicroUsd: 10_000_000 })
      )
    ).toBe(DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_AWU_CREDITS);
  });

  it("returns workspace override when set", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(
        makeWorkspace({ selfImprovementCapPerSkillAwuCredits: 1_000 })
      )
    ).toBe(1_000);
  });

  it("allows cap of 0", () => {
    expect(
      getWorkspaceDefaultSelfImprovementCapPerSkillAwuCredits(
        makeWorkspace({ selfImprovementCapPerSkillAwuCredits: 0 })
      )
    ).toBe(0);
  });
});

describe("getCurrentPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(metronomeContracts, "getCachedMetronomeCurrentBillingPeriod");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("fallback to current calendar month", () => {
    it("falls back when auth has no workspace", async () => {
      vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
      const { cycleStart, cycleEnd } = await getCurrentPeriod(makeAuth());
      expect(cycleStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });

    it("falls back when the Metronome API returns an error", async () => {
      vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
      vi.mocked(
        metronomeContracts.getCachedMetronomeCurrentBillingPeriod
      ).mockResolvedValue(new Err(new Error("Metronome unavailable")));
      const { cycleStart, cycleEnd } = await getCurrentPeriod(
        makeAuth({ hasWorkspace: true })
      );
      expect(cycleStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });

    it("falls back when Metronome has no billing period (Ok(null))", async () => {
      vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
      vi.mocked(
        metronomeContracts.getCachedMetronomeCurrentBillingPeriod
      ).mockResolvedValue(new Ok(null));
      const { cycleStart, cycleEnd } = await getCurrentPeriod(
        makeAuth({ hasWorkspace: true })
      );
      expect(cycleStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });
  });

  describe("using Metronome billing period", () => {
    it("returns the period from Metronome", async () => {
      vi.mocked(
        metronomeContracts.getCachedMetronomeCurrentBillingPeriod
      ).mockResolvedValue(
        new Ok({
          cycleStart: new Date("2026-03-04T00:00:00.000Z"),
          cycleEnd: new Date("2026-04-04T00:00:00.000Z"),
        })
      );
      const { cycleStart, cycleEnd } = await getCurrentPeriod(
        makeAuth({ hasWorkspace: true })
      );
      expect(cycleStart.toISOString()).toBe("2026-03-04T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-04T00:00:00.000Z");
    });
  });
});
