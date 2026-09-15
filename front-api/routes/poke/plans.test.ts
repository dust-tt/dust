import {
  FREE_BYOK_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function listPlans() {
  return honoApp.request("/api/poke/plans");
}

async function workspaceCountByPlanCode(): Promise<Map<string, number>> {
  const response = await listPlans();
  expect(response.status).toBe(200);
  const { plans } = await response.json();
  return new Map(
    plans.map((plan: { code: string; workspaceCount: number }) => [
      plan.code,
      plan.workspaceCount,
    ])
  );
}

describe("GET /api/poke/plans", () => {
  it("returns 401 when the user is not a super user", async () => {
    await createPokeApiMockRequest({ isSuperUser: false });

    const response = await listPlans();

    expect(response.status).toBe(401);
  });

  it("counts the workspaces subscribed to each plan", async () => {
    const workspace = await WorkspaceFactory.basic();
    await WorkspaceFactory.basic();
    await WorkspaceFactory.byok();
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const countByCode = await workspaceCountByPlanCode();

    expect(countByCode.get(PRO_PLAN_SEAT_29_CODE)).toBe(2);
    expect(countByCode.get(FREE_BYOK_PLAN_CODE)).toBe(1);
  });

  it("reports a plan with no subscriber as 0 rather than omitting it", async () => {
    const workspace = await WorkspaceFactory.basic();
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const countByCode = await workspaceCountByPlanCode();

    expect(countByCode.has(FREE_BYOK_PLAN_CODE)).toBe(true);
    expect(countByCode.get(FREE_BYOK_PLAN_CODE)).toBe(0);
  });

  it("does not count a workspace whose subscription has ended", async () => {
    const workspace = await WorkspaceFactory.basic();
    await SubscriptionResource.endActiveSubscription(workspace);
    await createPokeApiMockRequest({ isSuperUser: true, workspace });

    const countByCode = await workspaceCountByPlanCode();

    expect(countByCode.get(PRO_PLAN_SEAT_29_CODE)).toBe(0);
  });
});
