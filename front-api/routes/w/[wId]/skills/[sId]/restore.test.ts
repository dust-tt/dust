import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(options: { canWrite?: boolean } = {}) {
  const canWrite = options.canWrite ?? true;

  const { workspace, user } = await createPrivateApiMockRequest({
    role: "builder",
    method: "POST",
  });

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

  const skill = await SkillFactory.create(skillOwnerAuth, {
    status: "archived",
  });

  return { workspace, auth: skillOwnerAuth, skill };
}

function post(workspace: { sId: string }, sId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}/restore`, {
    method: "POST",
  });
}

describe("POST /api/w/:wId/skills/:sId/restore", () => {
  it("should return 200 and restore skill when user can write", async () => {
    const { workspace, skill, auth } = await setupTest({ canWrite: true });

    const response = await post(workspace, skill.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const updatedSkill = await SkillResource.fetchById(auth, skill.sId);
    expect(updatedSkill?.status).toBe("active");
  });

  it("should return 403 when user cannot write", async () => {
    const { workspace, skill } = await setupTest({ canWrite: false });

    const response = await post(workspace, skill.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can restore this skill.",
      },
    });
  });

  it("should return 404 when skill does not exist", async () => {
    const { workspace } = await setupTest({ canWrite: true });

    const response = await post(workspace, "non_existent_skill_id");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });
});
