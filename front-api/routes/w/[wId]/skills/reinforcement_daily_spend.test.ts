import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import { Authenticator } from "@app/lib/auth";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "GET", role });
}

function get(workspace: { sId: string }) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/reinforcement_daily_spend`
  );
}

describe("GET /api/w/:wId/skills/reinforcement_daily_spend", () => {
  it("returns daily spend keyed by date with period boundaries", async () => {
    const { workspace, user } = await setup();

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

    const response = await get(workspace);

    expect(response.status).toBe(200);

    const { dailySpendMicroUsd, periodStartDate, periodEndDate } =
      await response.json();

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
      const { workspace } = await setup(role);

      const response = await get(workspace);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: "Only admins can view self-improving skills daily spend.",
        },
      });
    }
  });
});
