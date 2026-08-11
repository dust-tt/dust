import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import {
  applyPlanLimitOverrides,
  EMPTY_PLAN_LIMIT_OVERRIDE,
  hasAnyPlanLimitOverride,
} from "@app/lib/plans/plan_limit_overrides";
import { describe, expect, it } from "vitest";

const PLAN = {
  ...FREE_NO_PLAN_DATA,
  maxUsersInWorkspace: 10,
  maxFreeUsersInWorkspace: 3,
  maxLifetimeFreeUsersInWorkspace: 5,
};

function override(partial: Partial<PlanLimitOverride>): PlanLimitOverride {
  return { ...EMPTY_PLAN_LIMIT_OVERRIDE, ...partial };
}

describe("applyPlanLimitOverrides", () => {
  it("returns the plan untouched when there is no override", () => {
    expect(applyPlanLimitOverrides(PLAN, null)).toEqual(PLAN);
    expect(applyPlanLimitOverrides(PLAN, EMPTY_PLAN_LIMIT_OVERRIDE)).toEqual(
      PLAN
    );
  });

  it("overrides only the fields that are set", () => {
    const res = applyPlanLimitOverrides(
      PLAN,
      override({ maxUsersInWorkspace: 500 })
    );

    expect(res.maxUsersInWorkspace).toBe(500);
    expect(res.maxFreeUsersInWorkspace).toBe(3);
    expect(res.maxLifetimeFreeUsersInWorkspace).toBe(5);
  });

  it("supports raising a limit to unlimited and lowering it to zero", () => {
    expect(
      applyPlanLimitOverrides(PLAN, override({ maxUsersInWorkspace: -1 }))
        .maxUsersInWorkspace
    ).toBe(-1);
    expect(
      applyPlanLimitOverrides(PLAN, override({ maxFreeUsersInWorkspace: 0 }))
        .maxFreeUsersInWorkspace
    ).toBe(0);
  });

  it("does not mutate the plan it is given", () => {
    applyPlanLimitOverrides(PLAN, override({ maxUsersInWorkspace: 500 }));

    expect(PLAN.maxUsersInWorkspace).toBe(10);
  });

  it("overrides the trial limits, since it is applied last", () => {
    // `getTrialVersionForPlan` caps maxUsersInWorkspace at 5; the override is
    // merged on top of that result.
    const trialPlan = { ...PLAN, maxUsersInWorkspace: 5 };

    expect(
      applyPlanLimitOverrides(trialPlan, override({ maxUsersInWorkspace: 50 }))
        .maxUsersInWorkspace
    ).toBe(50);
  });
});

describe("hasAnyPlanLimitOverride", () => {
  it("is false when every field is null", () => {
    expect(hasAnyPlanLimitOverride(EMPTY_PLAN_LIMIT_OVERRIDE)).toBe(false);
  });

  it("is true as soon as one field is set, including 0 and -1", () => {
    expect(
      hasAnyPlanLimitOverride(override({ maxLifetimeFreeUsersInWorkspace: 0 }))
    ).toBe(true);
    expect(hasAnyPlanLimitOverride(override({ maxUsersInWorkspace: -1 }))).toBe(
      true
    );
  });
});
