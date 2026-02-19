import { PlanModel } from "@app/lib/models/plan";
import { upsertFreePlans } from "@app/lib/plans/free_plans";
import { FREE_TEST_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { describe, expect, it } from "vitest";

describe("upsertFreePlans", () => {
  it("creates plans when they don't exist", async () => {
    await PlanModel.destroy({ where: { code: FREE_TEST_PLAN_CODE } });

    const beforePlan = await PlanModel.findOne({
      where: { code: FREE_TEST_PLAN_CODE },
    });
    expect(beforePlan).toBeNull();

    await upsertFreePlans(FREE_TEST_PLAN_CODE);

    const afterPlan = await PlanModel.findOne({
      where: { code: FREE_TEST_PLAN_CODE },
    });
    expect(afterPlan).not.toBeNull();
    expect(afterPlan?.code).toBe(FREE_TEST_PLAN_CODE);
  });

  it("updates plans when they already exist", async () => {
    await upsertFreePlans(FREE_TEST_PLAN_CODE);

    const plansBefore = await PlanModel.findAll({
      where: { code: FREE_TEST_PLAN_CODE },
    });
    expect(plansBefore).toHaveLength(1);
    const createdAt = plansBefore[0].createdAt;

    await upsertFreePlans(FREE_TEST_PLAN_CODE);

    const plansAfter = await PlanModel.findAll({
      where: { code: FREE_TEST_PLAN_CODE },
    });
    expect(plansAfter).toHaveLength(1);
    expect(plansAfter[0].createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("handles concurrent calls without race conditions", async () => {
    await PlanModel.destroy({ where: { code: FREE_TEST_PLAN_CODE } });

    const results = await Promise.allSettled([
      upsertFreePlans(FREE_TEST_PLAN_CODE),
      upsertFreePlans(FREE_TEST_PLAN_CODE),
      upsertFreePlans(FREE_TEST_PLAN_CODE),
      upsertFreePlans(FREE_TEST_PLAN_CODE),
      upsertFreePlans(FREE_TEST_PLAN_CODE),
    ]);

    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }

    const plans = await PlanModel.findAll({
      where: { code: FREE_TEST_PLAN_CODE },
    });
    expect(plans).toHaveLength(1);
  });
});
