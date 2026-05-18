import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./reinforcement";

async function setupTest(
  options: {
    skillOwnerRole?: "admin" | "builder" | "user";
    requestUserRole?: "admin" | "builder" | "user";
    method?: RequestMethod;
  } = {}
) {
  const skillOwnerRole = options.skillOwnerRole ?? "admin";
  const requestUserRole = options.requestUserRole ?? "admin";
  const method = options.method ?? "PATCH";

  const {
    req,
    res,
    workspace,
    user: requestUser,
  } = await createPrivateApiMockRequest({
    role: requestUserRole,
    method,
  });

  // System space + defaults for skill creation.
  if (requestUserRole === "admin") {
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
  } else {
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
  }

  let requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  let skillOwner: UserResource;
  let skillOwnerAuth: Authenticator;
  if (requestUserRole === skillOwnerRole) {
    skillOwner = requestUser;
    skillOwnerAuth = requestUserAuth;
  } else {
    skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: skillOwnerRole,
    });
    skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
  }

  const skillModel = await SkillFactory.create(skillOwnerAuth);
  const skill = await SkillResource.fetchByModelIdWithAuth(
    skillOwnerAuth,
    skillModel.id
  );
  if (!skill) {
    throw new Error("Failed to create skill");
  }

  // Refresh auths to pick up new group memberships.
  requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  req.query = { ...req.query, wId: workspace.sId, sId: skill.sId };

  return { req, res, skill, requestUserAuth };
}

describe("PATCH /api/w/[wId]/skills/[sId]/reinforcement", () => {
  it("updates the reinforcement field", async () => {
    const { req, res, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    expect(skill.reinforcement).toBe("on");

    req.body = { reinforcement: "off" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).not.toHaveProperty("error");

    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.reinforcement).toBe("off");
    // Other fields are untouched.
    expect(updated?.name).toBe(skill.name);
    expect(updated?.agentFacingDescription).toBe(skill.agentFacingDescription);
  });

  it("accepts each valid reinforcement mode", async () => {
    for (const mode of ["auto", "on", "off"] as const) {
      const { req, res, skill, requestUserAuth } = await setupTest({
        requestUserRole: "admin",
      });

      req.body = { reinforcement: mode };
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
      expect(updated?.reinforcement).toBe(mode);
    }
  });

  it("returns 403 for a non-editor user", async () => {
    const { req, res } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "user",
    });

    req.body = { reinforcement: "off" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can modify this skill.",
      },
    });
  });

  it("returns 400 for an invalid reinforcement value", async () => {
    const { req, res } = await setupTest({ requestUserRole: "admin" });

    req.body = { reinforcement: "sometimes" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 404 for a non-existent skill", async () => {
    const { req, res } = await setupTest({ requestUserRole: "admin" });

    req.query.sId = "non_existent_skill_sid";
    req.body = { reinforcement: "off" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("rejects non-PATCH methods", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
      const { req, res } = await setupTest({
        requestUserRole: "admin",
        method,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    }
  });

  it("returns 400 when no fields are provided", async () => {
    const { req, res } = await setupTest({ requestUserRole: "admin" });
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("updates selfImprovementLock", async () => {
    const { req, res, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    expect(skill.selfImprovementLock).toBe(false);

    req.body = { selfImprovementLock: true };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.selfImprovementLock).toBe(true);
    expect(updated?.reinforcement).toBe(skill.reinforcement);
  });

  it("updates selfImprovementCostsCapMicroUsd", async () => {
    const { req, res, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    req.body = { selfImprovementCostsCapMicroUsd: 25_000_000 };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.selfImprovementCostsCapMicroUsd).toBe(25_000_000);
  });

  it("sets selfImprovementCostsCapMicroUsd to null (use default)", async () => {
    const { req, res, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    // First set a custom cap.
    await skill.updateSelfImprovementCostsCap(10_000_000);

    req.body = { selfImprovementCostsCapMicroUsd: null };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.selfImprovementCostsCapMicroUsd).toBeNull();
  });

  it("updates multiple fields in a single request", async () => {
    const { req, res, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    req.body = {
      reinforcement: "off",
      selfImprovementLock: true,
      selfImprovementCostsCapMicroUsd: 5_000_000,
    };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.reinforcement).toBe("off");
    expect(updated?.selfImprovementLock).toBe(true);
    expect(updated?.selfImprovementCostsCapMicroUsd).toBe(5_000_000);
  });

  it("returns 403 when a non-admin tries to set selfImprovementLock", async () => {
    const { req, res } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
    });

    req.body = { selfImprovementLock: true };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only admins can change the lock state or per-skill cost cap.",
      },
    });
  });

  it("returns 403 when a non-admin tries to set the per-skill cap", async () => {
    const { req, res } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
    });

    req.body = { selfImprovementCostsCapMicroUsd: 5_000_000 };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("returns 403 when a non-admin tries to flip reinforcement on a locked skill", async () => {
    const { req, res, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
    });

    // Lock the skill via direct resource update — admin-only via the API.
    await skill.updateSelfImprovementLock(true);

    req.body = { reinforcement: "off" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "This skill's self-improvement is locked; only admins can change it.",
      },
    });
  });

  it("rejects negative cap values", async () => {
    const { req, res } = await setupTest({ requestUserRole: "admin" });

    req.body = { selfImprovementCostsCapMicroUsd: -1 };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});
