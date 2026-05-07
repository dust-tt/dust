import {
  DEFAULT_REINFORCEMENT_CAP_MICRO_USD,
  DEFAULT_SELF_IMPROVEMENT_CAP_PER_SKILL_MICRO_USD,
} from "@app/lib/reinforcement/constants";
import {
  getReinforcementMonthlyCapMicroUsd,
  getWorkspaceDefaultSelfImprovementCapPerSkillMicroUsd,
} from "@app/lib/reinforcement/consumption";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

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
