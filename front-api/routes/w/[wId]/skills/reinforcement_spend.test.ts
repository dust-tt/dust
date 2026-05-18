import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { MembershipRoleType } from "@app/types/memberships";

import { honoApp } from "@front-api/app";

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "GET", role });
}

function get(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/reinforcement_spend`);
}

describe("GET /api/w/:wId/skills/reinforcement_spend", () => {
  it("returns spend summed since the start of the current month, keyed by sId", async () => {
    const { workspace, user } = await setup();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillFactory.create(auth, { name: "Spent Skill" });
    const otherSkill = await SkillFactory.create(auth, {
      name: "Other Spent Skill",
    });

    const now = new Date();
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const inCurrentMonth = new Date(currentMonthStart.getTime() + 60_000);
    const beforeCurrentMonth = new Date(currentMonthStart.getTime() - 60_000);

    await SelfImprovingSkillsUsageResource.bulkCreate(auth, [
      {
        createdAt: inCurrentMonth,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 1_500_000,
      },
      {
        createdAt: inCurrentMonth,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 500_000,
      },
      // Excluded: before the current period start.
      {
        createdAt: beforeCurrentMonth,
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 999_000_000,
      },
      // Different skill, in-period.
      {
        createdAt: inCurrentMonth,
        skillId: otherSkill.id,
        conversationId: null,
        priceMicroUsd: 7_000_000,
      },
    ]);

    const response = await get(workspace);

    expect(response.status).toBe(200);
    const { spentMicroUsdBySkillId } = await response.json();
    expect(spentMicroUsdBySkillId).toEqual({
      [skill.sId]: 2_600_000,
      [otherSkill.sId]: 9_100_000,
    });
  });

  it("omits skills with no in-period spend", async () => {
    const { workspace, user } = await setup();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, { name: "Idle Skill" });

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect((await response.json()).spentMicroUsdBySkillId).toEqual({});
  });

  it("returns 403 for non-admin users", async () => {
    for (const role of ["builder", "user"] as const) {
      const { workspace } = await setup(role);

      const response = await get(workspace);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: "Only admins can view self-improving skills spend.",
        },
      });
    }
  });
});
