import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./restore";

async function setupTest(
  options: { method?: RequestMethod; canWrite?: boolean } = {}
) {
  const method = options.method ?? "POST";
  const canWrite = options.canWrite ?? true;

  const { req, res, workspace, user } = await createPrivateApiMockRequest({
    role: "builder",
    method,
  });

  await FeatureFlagFactory.basic("skills", workspace);

  let skillOwnerAuth: Authenticator;
  if (canWrite) {
    skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
  } else {
    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, { role: "admin" });
    skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
  }

  const skill = await SkillConfigurationFactory.create(skillOwnerAuth, {
    status: "archived",
  });

  req.query = { ...req.query, wId: workspace.sId, sId: skill.sId };

  return { req, res, workspace, user, auth: skillOwnerAuth, skill };
}

describe("POST /api/w/[wId]/skills/[sId]/restore", () => {
  it("should return 200 and restore skill when user can write", async () => {
    const { req, res, skill, auth } = await setupTest({ canWrite: true });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    const updatedSkill = await SkillResource.fetchById(auth, skill.sId);
    expect(updatedSkill?.status).toBe("active");
  });

  it("should return 403 when user cannot write", async () => {
    const { req, res } = await setupTest({ canWrite: false });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can restore this skill.",
      },
    });
  });

  it("should return 403 when skills feature flag is not enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "POST",
    });
    req.query = { ...req.query, wId: workspace.sId, sId: "some_skill_id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Skill builder is not enabled for this workspace.",
      },
    });
  });

  it("should return 404 when skill does not exist", async () => {
    const { req, res } = await setupTest({ canWrite: true });
    req.query.sId = "non_existent_skill_id";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });
});

describe("Method Support /api/w/[wId]/skills/[sId]/restore", () => {
  it("only supports POST method", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
      const { req, res } = await setupTest({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});
