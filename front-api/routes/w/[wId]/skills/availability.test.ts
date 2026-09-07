import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
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

  // Skills are created by another user so the requester is never in their
  // editor group: the batch endpoint relies on the publish permission alone.
  const skillOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, skillOwner, {
    role: "user",
  });
  const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    skillOwner.sId,
    workspace.sId
  );

  const requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  return {
    workspace,
    requestUser,
    requestUserAuth,
    skillOwner,
    skillOwnerAuth,
  };
}

function patchSkillsAvailability(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/availability`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/skills/availability", () => {
  it("updates the availability of several skills at once", async () => {
    const {
      workspace,
      requestUser,
      requestUserAuth,
      skillOwner,
      skillOwnerAuth,
    } = await setupTest();

    const firstSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "First Unpublished Skill",
      availability: "editors",
    });
    const secondSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Second Unpublished Skill",
      availability: "editors",
    });
    // Already at the requested availability: the update is a no-op.
    const unchangedSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Already Published Skill",
      availability: "workspace_users",
    });

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [firstSkill.sId, secondSkill.sId, unchangedSkill.sId],
      availability: "workspace_users",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(
      data.skills.map((s: { availability: string }) => s.availability)
    ).toEqual(["workspace_users", "workspace_users", "workspace_users"]);

    for (const sId of [firstSkill.sId, secondSkill.sId]) {
      const updatedSkill = await SkillResource.fetchById(requestUserAuth, sId);
      expect(updatedSkill?.availability).toBe("workspace_users");
      // Publishing counts as an edit: editedBy is stamped with the acting user.
      expect(updatedSkill?.editedBy).toBe(requestUser.id);
    }

    // The no-op skill is untouched: editedBy still points to its creator.
    const untouchedSkill = await SkillResource.fetchById(
      requestUserAuth,
      unchangedSkill.sId
    );
    expect(untouchedSkill?.availability).toBe("workspace_users");
    expect(untouchedSkill?.editedBy).toBe(skillOwner.id);
  });

  it("lets an admin change the availability of a skill built on a space they cannot read", async () => {
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

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [restrictedSkill.sId],
      availability: "workspace_users",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skills[0].availability).toBe("workspace_users");
    expect(data.skills[0].canRead).toBe(false);
    expect(data.skills[0].instructions).toBeNull();
    const [updated] = await SkillResource.fetchByIds(skillOwnerAuth, [
      restrictedSkill.sId,
    ]);
    expect(updated.availability).toBe("workspace_users");
  });

  it("refuses the batch when one of the skills is archived", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();

    const activeSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Active Batch Skill",
      availability: "editors",
    });
    const archivedSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Archived Batch Skill",
      availability: "editors",
    });
    await archivedSkill.archive(skillOwnerAuth);

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [activeSkill.sId, archivedSkill.sId],
      availability: "workspace_users",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Archived skills cannot be updated: Archived Batch Skill. Restore them first.",
      },
    });

    // The whole batch is rejected: the active skill keeps its availability too.
    const untouchedSkill = await SkillResource.fetchById(
      requestUserAuth,
      activeSkill.sId
    );
    expect(untouchedSkill?.availability).toBe("editors");
  });

  it("snapshots a version of each updated skill", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();

    const skill = await SkillFactory.create(skillOwnerAuth, {
      name: "Versioned Skill",
      availability: "editors",
    });

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "users_and_agents",
    });
    expect(response.status).toBe(200);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    const versions = (await updatedSkill?.listVersions(requestUserAuth)) ?? [];
    expect(versions.length).toBe(1);
  });

  it("denies a caller without the publish permission", async () => {
    const { workspace, skillOwnerAuth } = await setupTest("user");
    const skill = await SkillFactory.create(skillOwnerAuth);

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "users_and_agents",
    });

    expect(response.status).toBe(403);
  });

  it("denies making skills auto-discoverable without the make_discoverable permission", async () => {
    const { workspace, requestUser, skillOwnerAuth } = await setupTest("user");
    // The caller can publish skills, but not make them auto-discoverable.
    await grantWorkspacePermission(workspace, requestUser, {
      grantType: "publish",
      resourceType: "skill",
    });
    const skill = await SkillFactory.create(skillOwnerAuth, {
      availability: "editors",
    });

    const discoverableResponse = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "users_and_agents",
    });
    expect(discoverableResponse.status).toBe(403);

    // The publish permission alone still allows the non-discoverable availabilities.
    const workspaceResponse = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "workspace_users",
    });
    expect(workspaceResponse.status).toBe(200);
  });

  it("denies changing an auto-discoverable skill's availability without the make_discoverable permission", async () => {
    const { workspace, requestUser, requestUserAuth, skillOwnerAuth } =
      await setupTest("user");
    // The caller can publish skills, but not make them auto-discoverable.
    await grantWorkspacePermission(workspace, requestUser, {
      grantType: "publish",
      resourceType: "skill",
    });
    const skill = await SkillFactory.create(skillOwnerAuth, {
      availability: "users_and_agents",
    });

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "workspace_users",
    });
    expect(response.status).toBe(403);

    // The skill is left untouched.
    const unchangedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(unchangedSkill?.availability).toBe("users_and_agents");
  });

  it("allows changing an auto-discoverable skill's availability with the make_discoverable permission", async () => {
    const { workspace, requestUser, requestUserAuth, skillOwnerAuth } =
      await setupTest("user");
    await grantWorkspacePermission(workspace, requestUser, {
      grantType: "publish",
      resourceType: "skill",
    });
    await grantWorkspacePermission(workspace, requestUser, {
      grantType: "make_discoverable",
      resourceType: "skill",
    });
    const skill = await SkillFactory.create(skillOwnerAuth, {
      availability: "users_and_agents",
    });

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "workspace_users",
    });

    expect(response.status).toBe(200);
    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.availability).toBe("workspace_users");
  });

  it("allows making skills auto-discoverable with the make_discoverable permission", async () => {
    const { workspace, requestUser, requestUserAuth, skillOwnerAuth } =
      await setupTest("user");
    await grantWorkspacePermission(workspace, requestUser, {
      grantType: "publish",
      resourceType: "skill",
    });
    await grantWorkspacePermission(workspace, requestUser, {
      grantType: "make_discoverable",
      resourceType: "skill",
    });
    const skill = await SkillFactory.create(skillOwnerAuth, {
      availability: "editors",
    });

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "users_and_agents",
    });

    expect(response.status).toBe(200);
    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.availability).toBe("users_and_agents");
  });

  it("returns 404 when a skill is missing, without updating the others", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();
    const skill = await SkillFactory.create(skillOwnerAuth, {
      availability: "editors",
    });

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId, "skl_0000000000"],
      availability: "users_and_agents",
    });

    expect(response.status).toBe(404);
    const unchangedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(unchangedSkill?.availability).toBe("editors");
  });

  it("rejects an empty batch", async () => {
    const { workspace } = await setupTest();

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [],
      availability: "workspace_users",
    });

    expect(response.status).toBe(400);
  });
});
