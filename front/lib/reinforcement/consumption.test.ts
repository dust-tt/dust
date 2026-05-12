import type { Authenticator } from "@app/lib/auth";
import * as metronomeContracts from "@app/lib/metronome/contracts";
import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import {
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import {
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeAuth({
  metronomeContractId = null,
  metronomeCustomerId = null,
}: {
  metronomeContractId?: string | null;
  metronomeCustomerId?: string | null;
} = {}): Authenticator {
  return {
    subscription: () =>
      metronomeContractId !== null ? { metronomeContractId } : null,
    workspace: () =>
      metronomeCustomerId !== null ? { metronomeCustomerId } : null,
  } as unknown as Authenticator;
}

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

describe("getCurrentPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(metronomeContracts, "getMetronomeCurrentBillingPeriod");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("fallback to current calendar month", () => {
    it("falls back when auth has no metronome IDs", async () => {
      vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
      const { cycleStart, cycleEnd } = await getCurrentPeriod(makeAuth());
      expect(cycleStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });

    it("falls back when the Metronome API returns an error", async () => {
      vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
      vi.mocked(
        metronomeContracts.getMetronomeCurrentBillingPeriod
      ).mockResolvedValue(new Err(new Error("Metronome unavailable")));
      const { cycleStart, cycleEnd } = await getCurrentPeriod(
        makeAuth({
          metronomeContractId: "contract-1",
          metronomeCustomerId: "customer-1",
        })
      );
      expect(cycleStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });

    it("falls back when Metronome has no billing period (Ok(null))", async () => {
      vi.setSystemTime(new Date("2026-03-15T13:45:30.123Z"));
      vi.mocked(
        metronomeContracts.getMetronomeCurrentBillingPeriod
      ).mockResolvedValue(new Ok(null));
      const { cycleStart, cycleEnd } = await getCurrentPeriod(
        makeAuth({
          metronomeContractId: "contract-1",
          metronomeCustomerId: "customer-1",
        })
      );
      expect(cycleStart.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });
  });

  describe("using Metronome billing period", () => {
    it("returns the period from Metronome", async () => {
      vi.mocked(
        metronomeContracts.getMetronomeCurrentBillingPeriod
      ).mockResolvedValue(
        new Ok({
          cycleStart: new Date("2026-03-04T00:00:00.000Z"),
          cycleEnd: new Date("2026-04-04T00:00:00.000Z"),
        })
      );
      const { cycleStart, cycleEnd } = await getCurrentPeriod(
        makeAuth({
          metronomeContractId: "contract-1",
          metronomeCustomerId: "customer-1",
        })
      );
      expect(cycleStart.toISOString()).toBe("2026-03-04T00:00:00.000Z");
      expect(cycleEnd.toISOString()).toBe("2026-04-04T00:00:00.000Z");
    });
  });
});
