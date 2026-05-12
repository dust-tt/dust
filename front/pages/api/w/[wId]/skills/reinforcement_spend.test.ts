import { Authenticator } from "@app/lib/auth";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./reinforcement_spend";

async function setupTest(
  method: RequestMethod = "GET",
  role: MembershipRoleType = "admin"
) {
  return createPrivateApiMockRequest({ method, role });
}

describe("GET /api/w/[wId]/skills/reinforcement_spend", () => {
  it("returns spend summed since the start of the current month, keyed by sId", async () => {
    const { req, res, workspace, user } = await setupTest();

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

    req.query = { wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { spentMicroUsdBySkillId } = res._getJSONData();
    expect(spentMicroUsdBySkillId).toEqual({
      [skill.sId]: 2_600_000,
      [otherSkill.sId]: 9_100_000,
    });
  });

  it("omits skills with no in-period spend", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, { name: "Idle Skill" });

    req.query = { wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().spentMicroUsdBySkillId).toEqual({});
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
          message: "Only admins can view self-improving skills spend.",
        },
      });
    }
  });

  it("rejects non-GET methods", async () => {
    for (const method of ["POST", "PATCH", "DELETE"] as const) {
      const { req, res, workspace } = await setupTest(method);
      req.query = { wId: workspace.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    }
  });
});
