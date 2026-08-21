import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest({ role }: { role: "user" | "builder" | "admin" }) {
  const { workspace, key } = await createPublicApiMockRequest({ role });
  await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const skill = await SkillFactory.create(skillOwnerAuth, {
    name: "Skill to archive through the public API",
  });

  return { key, skill, skillOwnerAuth, workspace };
}

function archiveSkill(
  workspace: { sId: string },
  key: { secret: string },
  skillId: string
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/skills/${skillId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

describe("DELETE /api/v1/w/[wId]/skills/[skillId]", () => {
  it("archives a custom skill", async () => {
    const { key, skill, skillOwnerAuth, workspace } = await setupTest({
      role: "admin",
    });

    const response = await archiveSkill(workspace, key, skill.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const archivedSkill = await SkillResource.fetchById(
      skillOwnerAuth,
      skill.sId
    );
    expect(archivedSkill?.status).toBe("archived");
  });

  it("returns 404 when the skill does not exist", async () => {
    const { key, workspace } = await setupTest({ role: "admin" });

    const response = await archiveSkill(
      workspace,
      key,
      "non_existent_skill_id"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you requested was not found.",
      },
    });
  });

  it("rejects a non-admin API key", async () => {
    const { key, skill, skillOwnerAuth, workspace } = await setupTest({
      role: "user",
    });

    const response = await archiveSkill(workspace, key, skill.sId);

    expect(response.status).toBe(403);
    const unchangedSkill = await SkillResource.fetchById(
      skillOwnerAuth,
      skill.sId
    );
    expect(unchangedSkill?.status).toBe("active");
  });
});
