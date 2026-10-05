import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, user: requestUser } = await createPrivateApiMockRequest({
    role,
  });
  const skillOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, skillOwner, {
    role: "user",
  });

  const requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );
  const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    skillOwner.sId,
    workspace.sId
  );

  return { workspace, requestUserAuth, skillOwner, skillOwnerAuth };
}

function archiveSkills(workspace: { sId: string }, skillIds: string[]) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillIds }),
  });
}

describe("POST /api/w/:wId/skills/archive", () => {
  it("archives several skills at once", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();
    const firstSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "First Skill",
    });
    const secondSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Second Skill",
    });

    const response = await archiveSkills(workspace, [
      firstSkill.sId,
      secondSkill.sId,
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archived: 2 });
    const archivedSkills = await SkillResource.fetchByIds(requestUserAuth, [
      firstSkill.sId,
      secondSkill.sId,
    ]);
    expect(archivedSkills.map((skill) => skill.status)).toEqual([
      "archived",
      "archived",
    ]);
  });

  it("lets an admin archive a skill built on a space they cannot read", async () => {
    const { workspace, requestUserAuth, skillOwner, skillOwnerAuth } =
      await setupTest();
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(requestUserAuth, {
      userIds: [skillOwner.sId],
    });
    const restrictedSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Restricted Space Skill",
      availability: "editors",
      requestedSpaceIds: [restrictedSpace.id],
    });
    // The admin cannot read the skill through the regular fetch.
    expect(
      await SkillResource.fetchByIds(requestUserAuth, [restrictedSkill.sId])
    ).toEqual([]);

    const response = await archiveSkills(workspace, [restrictedSkill.sId]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ archived: 1 });
    const [archived] = await SkillResource.fetchByIds(skillOwnerAuth, [
      restrictedSkill.sId,
    ]);
    expect(archived.status).toBe("archived");
  });

  it("denies a caller who cannot administrate every skill", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } =
      await setupTest("user");
    const administratedSkill = await SkillFactory.create(requestUserAuth, {
      name: "Administrated Skill",
    });
    const otherSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Other Skill",
    });

    const response = await archiveSkills(workspace, [
      administratedSkill.sId,
      otherSkill.sId,
    ]);

    expect(response.status).toBe(403);
    const unchangedSkills = await SkillResource.fetchByIds(requestUserAuth, [
      administratedSkill.sId,
      otherSkill.sId,
    ]);
    expect(unchangedSkills.map((skill) => skill.status)).toEqual([
      "active",
      "active",
    ]);
  });

  it("does not archive any skill when one is missing", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();
    const skill = await SkillFactory.create(skillOwnerAuth);

    const response = await archiveSkills(workspace, [
      skill.sId,
      "skl_0000000000",
    ]);

    expect(response.status).toBe(404);
    const unchangedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(unchangedSkill?.status).toBe("active");
  });
});
