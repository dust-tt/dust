import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
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
    role: "builder",
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
  it("rejects the request when skill publication governance is off", async () => {
    const { workspace, skillOwnerAuth } = await setupTest();
    const skill = await SkillFactory.create(skillOwnerAuth);

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "users_and_agents",
    });

    expect(response.status).toBe(400);
  });

  it("updates the availability of several skills at once", async () => {
    const {
      workspace,
      requestUser,
      requestUserAuth,
      skillOwner,
      skillOwnerAuth,
    } = await setupTest();
    await FeatureFlagFactory.basic(
      requestUserAuth,
      "admin_governance_skill_publication"
    );

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

  it("snapshots a version of each updated skill", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();
    await FeatureFlagFactory.basic(
      requestUserAuth,
      "admin_governance_skill_publication"
    );

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
    const { workspace, requestUserAuth, skillOwnerAuth } =
      await setupTest("builder");
    await FeatureFlagFactory.basic(
      requestUserAuth,
      "admin_governance_skill_publication"
    );
    const skill = await SkillFactory.create(skillOwnerAuth);

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [skill.sId],
      availability: "users_and_agents",
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when a skill is missing, without updating the others", async () => {
    const { workspace, requestUserAuth, skillOwnerAuth } = await setupTest();
    await FeatureFlagFactory.basic(
      requestUserAuth,
      "admin_governance_skill_publication"
    );
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
    const { workspace, requestUserAuth } = await setupTest();
    await FeatureFlagFactory.basic(
      requestUserAuth,
      "admin_governance_skill_publication"
    );

    const response = await patchSkillsAvailability(workspace, {
      skillIds: [],
      availability: "workspace_users",
    });

    expect(response.status).toBe(400);
  });
});
