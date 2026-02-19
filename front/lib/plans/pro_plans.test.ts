import { PlanModel } from "@app/lib/models/plan";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { upsertProPlans } from "@app/lib/plans/pro_plans";
import { describe, expect, it } from "vitest";

describe("upsertProPlans", () => {
  it("creates plans when they don't exist", async () => {
    await PlanModel.destroy({ where: { code: PRO_PLAN_SEAT_29_CODE } });

    const beforePlan = await PlanModel.findOne({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    expect(beforePlan).toBeNull();

    await upsertProPlans(PRO_PLAN_SEAT_29_CODE);

    const afterPlan = await PlanModel.findOne({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    expect(afterPlan).not.toBeNull();
    expect(afterPlan?.code).toBe(PRO_PLAN_SEAT_29_CODE);
    expect(afterPlan?.name).toBe("Pro");
  });

  it("updates plans when they already exist", async () => {
    await upsertProPlans(PRO_PLAN_SEAT_29_CODE);

    const plansBefore = await PlanModel.findAll({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    expect(plansBefore).toHaveLength(1);
    const createdAt = plansBefore[0].createdAt;

    await upsertProPlans(PRO_PLAN_SEAT_29_CODE);

    const plansAfter = await PlanModel.findAll({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    expect(plansAfter).toHaveLength(1);
    expect(plansAfter[0].createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("handles concurrent calls without race conditions", async () => {
    await PlanModel.destroy({ where: { code: PRO_PLAN_SEAT_29_CODE } });

    const results = await Promise.allSettled([
      upsertProPlans(PRO_PLAN_SEAT_29_CODE),
      upsertProPlans(PRO_PLAN_SEAT_29_CODE),
      upsertProPlans(PRO_PLAN_SEAT_29_CODE),
      upsertProPlans(PRO_PLAN_SEAT_29_CODE),
      upsertProPlans(PRO_PLAN_SEAT_29_CODE),
    ]);

    for (const result of results) {
      expect(result.status).toBe("fulfilled");
    }

    const plans = await PlanModel.findAll({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    expect(plans).toHaveLength(1);
  });
});
