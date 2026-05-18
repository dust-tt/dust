import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import { Authenticator } from "@app/lib/auth";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./reinforcement_daily_spend";

async function setupTest(
  method: RequestMethod = "GET",
  role: MembershipRoleType = "admin"
) {
  return createPrivateApiMockRequest({ method, role });
}

describe("GET /api/w/[wId]/skills/reinforcement_daily_spend", () => {
  it("returns daily spend keyed by date with period boundaries", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillFactory.create(auth, {
      name: "Daily Spend Skill",
    });

    const now = new Date();
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const day1 = new Date(currentMonthStart.getTime() + 60_000);
    const day2 = new Date(
      currentMonthStart.getTime() + 24 * 60 * 60 * 1000 + 60_000
    );
    const beforePeriod = new Date(currentMonthStart.getTime() - 60_000);

    await SelfImprovingSkillsUsageResource.bulkCreate(auth, [
      {
        createdAt: day1,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 1_000_000,
      },
      {
        createdAt: day1,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 500_000,
      },
      {
        createdAt: day2,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 3_000_000,
      },
      // Excluded: before the current period.
      {
        createdAt: beforePeriod,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 999_000_000,
      },
    ]);

    req.query = { wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const { dailySpendMicroUsd, periodStartDate, periodEndDate } =
      res._getJSONData();

    // Period boundaries are returned as ISO strings.
    expect(periodStartDate).toBeTruthy();
    expect(periodEndDate).toBeTruthy();

    const day1Str = day1.toISOString().slice(0, 10);
    const day2Str = day2.toISOString().slice(0, 10);

    expect(dailySpendMicroUsd[day1Str]).toBe(1_500_000 * MARKUP_MULTIPLIER);
    expect(dailySpendMicroUsd[day2Str]).toBe(3_000_000 * MARKUP_MULTIPLIER);

    // Before-period row should not appear.
    const beforeStr = beforePeriod.toISOString().slice(0, 10);
    expect(dailySpendMicroUsd[beforeStr]).toBeUndefined();
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["builder", "user"] as const) {
      const { req, res, workspace } = await setupTest("GET", role);
      req.query = { wId: workspace.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: "Only admins can view self-improving skills daily spend.",
        },
      });
    }
  });
});
