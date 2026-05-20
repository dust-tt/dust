import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(
  options: {
    skillOwnerRole?: "admin" | "builder" | "user";
    requestUserRole?: "admin" | "builder" | "user";
  } = {}
) {
  const skillOwnerRole = options.skillOwnerRole ?? "admin";
  const requestUserRole = options.requestUserRole ?? "admin";

  const { workspace, user: requestUser } = await createPrivateApiMockRequest({
    role: requestUserRole,
    method: "PATCH",
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

  requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  return { workspace, skill, requestUserAuth };
}

function patch(workspace: { sId: string }, sId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/${sId}/reinforcement`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/w/:wId/skills/:sId/reinforcement", () => {
  it("updates the reinforcement field", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    expect(skill.reinforcement).toBe("on");

    const response = await patch(workspace, skill.sId, {
      reinforcement: "off",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("error");

    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.reinforcement).toBe("off");
    expect(updated?.name).toBe(skill.name);
    expect(updated?.agentFacingDescription).toBe(skill.agentFacingDescription);
  });

  it("accepts each valid reinforcement mode", async () => {
    for (const mode of ["auto", "on", "off"] as const) {
      const { workspace, skill, requestUserAuth } = await setupTest({
        requestUserRole: "admin",
      });

      const response = await patch(workspace, skill.sId, {
        reinforcement: mode,
      });

      expect(response.status).toBe(200);
      const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
      expect(updated?.reinforcement).toBe(mode);
    }
  });

  it("returns 403 for a non-editor user", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "user",
    });

    const response = await patch(workspace, skill.sId, {
      reinforcement: "off",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can modify this skill.",
      },
    });
  });

  it("returns 400 for an invalid reinforcement value", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await patch(workspace, skill.sId, {
      reinforcement: "sometimes",
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 for a non-existent skill", async () => {
    const { workspace } = await setupTest({ requestUserRole: "admin" });

    const response = await patch(workspace, "non_existent_skill_sid", {
      reinforcement: "off",
    });

    expect(response.status).toBe(404);
  });

  it("returns 400 when no fields are provided", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await patch(workspace, skill.sId, {});

    expect(response.status).toBe(400);
  });

  it("updates selfImprovementLock", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    expect(skill.selfImprovementLock).toBe(false);

    const response = await patch(workspace, skill.sId, {
      selfImprovementLock: true,
    });

    expect(response.status).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.selfImprovementLock).toBe(true);
    expect(updated?.reinforcement).toBe(skill.reinforcement);
  });

  it("updates selfImprovementCostsCapMicroUsd", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const response = await patch(workspace, skill.sId, {
      selfImprovementCostsCapMicroUsd: 25_000_000,
    });

    expect(response.status).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.selfImprovementCostsCapMicroUsd).toBe(25_000_000);
  });

  it("sets selfImprovementCostsCapMicroUsd to null (use default)", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    // First set a custom cap.
    await skill.updateSelfImprovementCostsCap(10_000_000);

    const response = await patch(workspace, skill.sId, {
      selfImprovementCostsCapMicroUsd: null,
    });

    expect(response.status).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.selfImprovementCostsCapMicroUsd).toBeNull();
  });

  it("updates multiple fields in a single request", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const response = await patch(workspace, skill.sId, {
      reinforcement: "off",
      selfImprovementLock: true,
      selfImprovementCostsCapMicroUsd: 5_000_000,
    });

    expect(response.status).toBe(200);
    const updated = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updated?.reinforcement).toBe("off");
    expect(updated?.selfImprovementLock).toBe(true);
    expect(updated?.selfImprovementCostsCapMicroUsd).toBe(5_000_000);
  });

  it("returns 403 when a non-admin tries to set selfImprovementLock", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
    });

    const response = await patch(workspace, skill.sId, {
      selfImprovementLock: true,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only admins can change the lock state or per-skill cost cap.",
      },
    });
  });

  it("returns 403 when a non-admin tries to set the per-skill cap", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
    });

    const response = await patch(workspace, skill.sId, {
      selfImprovementCostsCapMicroUsd: 5_000_000,
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 when a non-admin tries to flip reinforcement on a locked skill", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
    });

    // Lock the skill via direct resource update — admin-only via the API.
    await skill.updateSelfImprovementLock(true);

    const response = await patch(workspace, skill.sId, {
      reinforcement: "off",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "This skill's self-improvement is locked; only admins can change it.",
      },
    });
  });

  it("rejects negative cap values", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await patch(workspace, skill.sId, {
      selfImprovementCostsCapMicroUsd: -1,
    });

    expect(response.status).toBe(400);
  });
});
