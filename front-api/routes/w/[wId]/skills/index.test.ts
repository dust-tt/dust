import { Authenticator } from "@app/lib/auth";
import {
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { discoverToolsSkill } from "@app/lib/resources/skill/code_defined/system/discover_tools";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  GetSkillsResponseBody,
  GetSkillsWithRelationsResponseBody,
} from "@app/types/api/skills";
import type {
  SkillWithoutInstructionsAndToolsType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

async function setupTest(role: MembershipRoleType = "user") {
  return createPrivateApiMockRequest({ role });
}

// A non-admin membership role doesn't grant create/skill by itself — it requires a group grant.
// Used by tests that specifically need a non-admin caller (e.g. to exercise space-access checks
// admins would otherwise bypass) while still being allowed to create a skill.
async function grantCreateSkillCapability(
  workspace: Awaited<ReturnType<typeof setupTest>>["workspace"],
  user: Awaited<ReturnType<typeof setupTest>>["user"]
) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const group = await GroupFactory.regularAuto(
    workspace,
    `skill-creator-${user.sId}`
  );
  await GroupFactory.withMembers(adminAuth, group, [user]);
  await GroupPermissionResource.grantTypeWide(adminAuth, {
    group,
    grantType: "create",
    resourceType: "skill",
  });
}

function getSkills(
  workspace: { sId: string },
  query: Record<string, string> = {}
) {
  const search = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/skills${search ? `?${search}` : ""}`
  );
}

function postSkill(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function favoriteSkill(workspace: { sId: string }, skillId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${skillId}/favorite`, {
    method: "POST",
  });
}

function unfavoriteSkill(workspace: { sId: string }, skillId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${skillId}/favorite`, {
    method: "DELETE",
  });
}

describe("GET /api/w/:wId/skills", () => {
  it("should return 200 with skills", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, {
      name: "Test Skill 1",
      agentFacingDescription: "First test skill",
    });
    await SkillFactory.create(auth, {
      name: "Test Skill 2",
      agentFacingDescription: "Second test skill",
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("skills");

    const skillNames = data.skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Test Skill 1");
    expect(skillNames).toContain("Test Skill 2");
  });

  it("only lists editors-only skills to members of their editor group", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Skill whose editor group the requester belongs to (creator is an editor).
    await SkillFactory.create(auth, {
      name: "My Unpublished Skill",
      availability: "editors",
    });

    // Skills created by another user: the requester is not in their editor groups.
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    await SkillFactory.create(otherAuth, {
      name: "Someone Else's Unpublished Skill",
      availability: "editors",
    });
    await SkillFactory.create(otherAuth, {
      name: "Someone Else's Published Skill",
      availability: "workspace_users",
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("My Unpublished Skill");
    expect(skillNames).toContain("Someone Else's Published Skill");
    expect(skillNames).not.toContain("Someone Else's Unpublished Skill");
  });

  // Archiving no longer suspends the editor memberships, so an archived editors-only skill
  // stays visible to its editors — otherwise it would vanish from the archived tab for
  // everyone, leaving nobody able to restore it.
  it("lists archived editors-only skills to members of their editor group", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const mySkill = await SkillFactory.create(auth, {
      name: "My Archived Unpublished Skill",
      availability: "editors",
    });
    await mySkill.archive(auth);

    // Archived by another user: the requester is not one of its editors.
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "manager",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherSkill = await SkillFactory.create(otherAuth, {
      name: "Someone Else's Archived Unpublished Skill",
      availability: "editors",
    });
    await otherSkill.archive(otherAuth);

    const response = await getSkills(workspace, { status: "archived" });

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("My Archived Unpublished Skill");
    expect(skillNames).not.toContain(
      "Someone Else's Archived Unpublished Skill"
    );
  });

  // Suggestions are created with an empty editor group (SkillResource.makeSuggestion), and
  // they get editors-only availability. Without the status exemption the editor-visibility
  // rule would hide them from everyone.
  it("lists editors-only suggestions to admins who can create skills", async () => {
    const { workspace, user } = await setupTest("admin");

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
      availability: "editors",
      addCurrentUserAsEditor: false,
    });

    // A regular unpublished skill the admin does not edit stays hidden: the exemption is
    // scoped to suggestions, not to admins at large (that is bypassEditorVisibility's job).
    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    await SkillFactory.create(skillOwnerAuth, {
      name: "Someone Else's Unpublished Skill",
      availability: "editors",
    });

    const response = await getSkills(workspace, { status: "suggested" });
    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Suggested Skill");

    const activeResponse = await getSkills(workspace);
    expect(activeResponse.status).toBe(200);
    const activeSkillNames = (await activeResponse.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(activeSkillNames).not.toContain("Someone Else's Unpublished Skill");
  });

  it("does not list editors-only suggestions to members who cannot administrate skills", async () => {
    const { workspace, user } = await setupTest("user");

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    await SkillFactory.create(adminAuth, {
      name: "Suggested Skill",
      status: "suggested",
      availability: "editors",
      addCurrentUserAsEditor: false,
    });

    // Even with the create/skill capability, a user cannot administrate the suggestion's
    // editor group, so the suggestion stays hidden.
    await grantCreateSkillCapability(workspace, user);

    const response = await getSkills(workspace, { status: "suggested" });
    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).not.toContain("Suggested Skill");
  });

  it("lets admins bypass editor visibility to list unpublished skills they do not edit", async () => {
    const { workspace } = await setupTest("admin");

    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    await SkillFactory.create(skillOwnerAuth, {
      name: "Someone Else's Unpublished Skill",
      availability: "editors",
    });

    // The requesting admin is not in the skill's editor group: without the param the
    // unpublished skill stays hidden.
    const withoutParamResponse = await getSkills(workspace);
    expect(withoutParamResponse.status).toBe(200);
    const withoutParamNames = (await withoutParamResponse.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(withoutParamNames).not.toContain("Someone Else's Unpublished Skill");

    const response = await getSkills(workspace, {
      bypassEditorVisibility: "true",
    });
    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Someone Else's Unpublished Skill");
  });

  it("rejects bypassEditorVisibility for non-admins", async () => {
    const { workspace } = await setupTest("user");

    const response = await getSkills(workspace, {
      bypassEditorVisibility: "true",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only admins can bypass editor visibility.",
      },
    });
  });

  it("filters by availability, with isDefault=true as a deprecated alias", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, {
      name: "Workspace Skill",
      availability: "workspace_users",
    });
    await SkillFactory.create(auth, {
      name: "Discoverable Skill",
      availability: "users_and_agents",
    });

    const equivalentQueries: Record<string, string>[] = [
      { availability: "users_and_agents" },
      { isDefault: "true" },
    ];
    for (const query of equivalentQueries) {
      const response = await getSkills(workspace, query);
      expect(response.status).toBe(200);
      const skillNames = (await response.json()).skills.map(
        (s: SkillWithoutInstructionsAndToolsType) => s.name
      );
      expect(skillNames).toContain("Discoverable Skill");
      expect(skillNames).not.toContain("Workspace Skill");
    }

    // An explicit availability takes priority over the deprecated alias.
    const response = await getSkills(workspace, {
      availability: "workspace_users",
      isDefault: "true",
    });
    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Workspace Skill");
    expect(skillNames).not.toContain("Discoverable Skill");

    // Several availabilities can be requested at once (repeated query param).
    const multiResponse = await honoApp.request(
      `/api/w/${workspace.sId}/skills?availability=workspace_users&availability=users_and_agents&onlyCustom=true`
    );
    expect(multiResponse.status).toBe(200);
    const multiSkillNames = (await multiResponse.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(multiSkillNames).toContain("Workspace Skill");
    expect(multiSkillNames).toContain("Discoverable Skill");

    const invalidResponse = await getSkills(workspace, {
      availability: "everyone",
    });
    expect(invalidResponse.status).toBe(400);
  });

  it("should only return active skills", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, {
      name: "Active Skill",
      status: "active",
    });
    await SkillFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
    });
    await SkillFactory.create(auth, {
      name: "Archived Skill",
      status: "archived",
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);
    const data = await response.json();

    const skillNames = data.skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Active Skill");
    expect(skillNames).not.toContain("Archived Skill");
  });

  it("should include global skills by default and exclude them when onlyCustom=true", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const customSkill = await SkillFactory.create(auth, {
      name: "Custom Skill",
    });

    const response1 = await getSkills(workspace);
    expect(response1.status).toBe(200);
    const allSkillIds = (await response1.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.sId
    );
    expect(allSkillIds).toContain("frames");
    expect(allSkillIds).toContain(customSkill.sId);

    const response2 = await getSkills(workspace, { onlyCustom: "true" });
    expect(response2.status).toBe(200);
    const customOnlySIds = (await response2.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.sId
    );
    expect(customOnlySIds).not.toContain("frames");
    expect(customOnlySIds).toContain(customSkill.sId);
  });

  it("should return suggested skills when status=suggested", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillFactory.create(auth, { name: "Active Skill", status: "active" });
    await SkillFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
    });
    await SkillFactory.create(auth, {
      name: "Archived Skill",
      status: "archived",
    });

    const response = await getSkills(workspace, { status: "suggested" });

    expect(response.status).toBe(200);
    const data = await response.json();

    const skillNames = data.skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Suggested Skill");
    expect(skillNames).not.toContain("Active Skill");
    expect(skillNames).not.toContain("Archived Skill");
  });

  it("should work for user and admin roles", async () => {
    for (const role of ["user", "admin"] as const) {
      const { workspace, user } = await setupTest(role);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      await SkillFactory.create(auth, { name: `Skill for ${role}` });

      const response = await getSkills(workspace);

      expect(response.status).toBe(200);
      const skillNames = (await response.json()).skills.map(
        (s: SkillWithoutInstructionsAndToolsType) => s.name
      );
      expect(skillNames).toContain(`Skill for ${role}`);
    }
  });

  it("should not return skills with requestedSpaceIds user cannot access", async () => {
    const { workspace, auth } = await setupTest();

    await SkillFactory.create(auth, { name: "Accessible Skill" });

    const restrictedSpace = await SpaceFactory.regular(workspace);

    await SkillFactory.create(auth, {
      name: "Restricted Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Accessible Skill");
    expect(skillNames).not.toContain("Restricted Skill");
  });

  it("should return skills when user has access to requestedSpaceIds", async () => {
    const { workspace, user, auth } = await setupTest("admin");

    await SpaceFactory.defaults(auth);

    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [user.sId] });

    await SkillFactory.create(auth, {
      name: "Skill In Restricted Space",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);
    const skillNames = (await response.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(skillNames).toContain("Skill In Restricted Space");
  });

  it("includes accessible restricted skills by default but excludes them when globalSpaceOnly=true", async () => {
    const { workspace, user, auth } = await setupTest("admin");

    await SpaceFactory.defaults(auth);

    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [user.sId] });

    await SkillFactory.create(auth, {
      name: "Member Restricted Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const defaultRes = await getSkills(workspace);
    const defaultNames = (await defaultRes.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(defaultNames).toContain("Member Restricted Skill");

    const globalRes = await getSkills(workspace, { globalSpaceOnly: "true" });
    const globalNames = (await globalRes.json()).skills.map(
      (s: SkillWithoutInstructionsAndToolsType) => s.name
    );
    expect(globalNames).not.toContain("Member Restricted Skill");
  });

  it("should not return instructions or tools in skill list", async () => {
    const { workspace, auth, user } = await setupTest();

    const skill = await SkillFactory.create(auth, {
      name: "Picker Skill",
      userFacingDescription: "Shown in the capabilities picker",
    });
    const fileAttachmentFindAllSpy = vi.spyOn(
      SkillFileAttachmentModel,
      "findAll"
    );

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);

    const responseBody: GetSkillsResponseBody = await response.json();
    const skillWithoutInstructionsAndTools = responseBody.skills.find(
      (s) => s.sId === skill.sId
    );

    expect(skillWithoutInstructionsAndTools).toMatchObject({
      sId: skill.sId,
      name: "Picker Skill",
      userFacingDescription: "Shown in the capabilities picker",
      agentFacingDescription: "Test skill agent facing description",
      editedBy: user.id,
      status: "active",
      requestedSpaceIds: [],
      fileAttachments: [],
      isDefault: false,
    });
    expect(skillWithoutInstructionsAndTools).toHaveProperty("createdAt");
    expect(skillWithoutInstructionsAndTools).toHaveProperty("updatedAt");
    expect(skillWithoutInstructionsAndTools).toHaveProperty("source");
    expect(skillWithoutInstructionsAndTools).toHaveProperty("sourceMetadata");
    expect(skillWithoutInstructionsAndTools).not.toHaveProperty("instructions");
    expect(skillWithoutInstructionsAndTools).not.toHaveProperty(
      "instructionsHtml"
    );
    expect(skillWithoutInstructionsAndTools).not.toHaveProperty("tools");
    expect(fileAttachmentFindAllSpy).not.toHaveBeenCalled();
    fileAttachmentFindAllSpy.mockRestore();
  });

  it("should not fetch dynamic global instructions", async () => {
    const { workspace } = await setupTest();

    const fetchInstructionsSpy = vi.spyOn(
      discoverToolsSkill,
      "fetchInstructions"
    );
    try {
      const response = await getSkills(workspace, {
        globalSpaceOnly: "true",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(
        data.skills.some(
          (s: SkillWithoutInstructionsAndToolsType) =>
            s.sId === discoverToolsSkill.sId
        )
      ).toBe(true);
      expect(fetchInstructionsSpy).not.toHaveBeenCalled();
    } finally {
      fetchInstructionsSpy.mockRestore();
    }
  });

  it("should include favorite state for custom skills", async () => {
    const { workspace, auth } = await setupTest();

    const skill = await SkillFactory.create(auth, {
      name: "Favorite Candidate",
    });

    const firstResponse = await getSkills(workspace);
    expect(firstResponse.status).toBe(200);
    const firstResponseBody: GetSkillsResponseBody = await firstResponse.json();
    const firstSkill = firstResponseBody.skills.find(
      (s) => s.sId === skill.sId
    );
    expect(firstSkill?.isFavorite).toBe(false);

    const favoriteResponse = await favoriteSkill(workspace, skill.sId);
    expect(favoriteResponse.status).toBe(200);

    const secondResponse = await getSkills(workspace);
    expect(secondResponse.status).toBe(200);
    const secondResponseBody: GetSkillsResponseBody =
      await secondResponse.json();
    const secondSkill = secondResponseBody.skills.find(
      (s) => s.sId === skill.sId
    );
    expect(secondSkill?.isFavorite).toBe(true);

    const relationsResponse = await getSkills(workspace, {
      withRelations: "true",
    });
    expect(relationsResponse.status).toBe(200);
    const relationsResponseBody: GetSkillsWithRelationsResponseBody =
      await relationsResponse.json();
    const relationsSkill = relationsResponseBody.skills.find(
      (s) => s.sId === skill.sId
    );
    expect(relationsSkill?.isFavorite).toBe(true);

    const unfavoriteResponse = await unfavoriteSkill(workspace, skill.sId);
    expect(unfavoriteResponse.status).toBe(200);

    const thirdResponse = await getSkills(workspace);
    expect(thirdResponse.status).toBe(200);
    const thirdResponseBody: GetSkillsResponseBody = await thirdResponse.json();
    const thirdSkill = thirdResponseBody.skills.find(
      (s) => s.sId === skill.sId
    );
    expect(thirdSkill?.isFavorite).toBe(false);
  });

  it("should include favorite state for global skills", async () => {
    const { workspace } = await setupTest();

    const favoriteResponse = await favoriteSkill(workspace, "frames");
    expect(favoriteResponse.status).toBe(200);

    const response = await getSkills(workspace);
    expect(response.status).toBe(200);
    const responseBody: GetSkillsResponseBody = await response.json();
    const framesSkill = responseBody.skills.find((s) => s.sId === "frames");
    expect(framesSkill?.isFavorite).toBe(true);
  });

  it("should not update favorite state for archived skills", async () => {
    const { workspace, auth } = await setupTest();

    const skill = await SkillFactory.create(auth, {
      name: "Archived Favorite Candidate",
      status: "archived",
    });

    const favoriteResponse = await favoriteSkill(workspace, skill.sId);
    expect(favoriteResponse.status).toBe(400);
    expect(await favoriteResponse.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only active skills can update favorite state.",
      },
    });

    const unfavoriteResponse = await unfavoriteSkill(workspace, skill.sId);
    expect(unfavoriteResponse.status).toBe(400);
    expect(await unfavoriteResponse.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only active skills can update favorite state.",
      },
    });
  });
});

describe("GET /api/w/:wId/skills?withRelations=true", () => {
  it("returns the editors of archived skills", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const skill = await SkillFactory.create(auth, {
      name: "Archived Skill With Editors",
    });
    await skill.archive(auth);

    const response = await getSkills(workspace, {
      withRelations: "true",
      status: "archived",
    });
    expect(response.status).toBe(200);

    const responseBody: GetSkillsWithRelationsResponseBody =
      await response.json();
    const archivedSkill = responseBody.skills.find((s) => s.sId === skill.sId);
    // Archiving keeps the editor memberships: the skill stays visible to its editors (it is
    // unpublished, so that visibility comes from editorship) and still lists them.
    expect(archivedSkill?.relations.editors?.map((e) => e.sId)).toEqual([
      user.sId,
    ]);
  });

  it("should return the number of messages using each skill", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const skill = await SkillFactory.create(auth, {
      name: "Skill Used In Messages",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });

    await skill.enableForAgent(auth, {
      agentConfiguration: agent,
      conversation,
    });

    const firstAgentMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 0,
        agentConfigurationId: agent.sId,
      });
    if (!firstAgentMessage.agentMessageId) {
      throw new Error("Expected an agent message");
    }
    await SkillResource.snapshotConversationSkillsForMessage(auth, {
      agentConfigurationId: agent.sId,
      agentMessageId: firstAgentMessage.agentMessageId,
      conversationId: conversation.id,
    });

    const secondAgentMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agent.sId,
      });
    if (!secondAgentMessage.agentMessageId) {
      throw new Error("Expected an agent message");
    }
    await SkillResource.snapshotConversationSkillsForMessage(auth, {
      agentConfigurationId: agent.sId,
      agentMessageId: secondAgentMessage.agentMessageId,
      conversationId: conversation.id,
    });

    const response = await getSkills(workspace, {
      withRelations: "true",
      withMessageCount: "true",
    });

    expect(response.status).toBe(200);
    const responseBody: GetSkillsWithRelationsResponseBody =
      await response.json();
    const skillResult = responseBody.skills.find(
      (listedSkill) => listedSkill.sId === skill.sId
    );
    const systemSkillResult = responseBody.skills.find(
      (listedSkill) => listedSkill.sId === "discover_tools"
    );

    expect(skillResult?.messageCount).toBe(2);
    expect(systemSkillResult).toBeDefined();
    expect(systemSkillResult?.messageCount).toBeNull();
  });

  it("should return skills with usage when linked to agents", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillFactory.create(auth, { name: "Skill With Usage" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const response = await getSkills(workspace, { withRelations: "true" });

    expect(response.status).toBe(200);

    const skillId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsWithRelationsType) =>
        s.sId === skillId
    );

    expect(skillResult).toMatchObject({
      relations: {
        usage: {
          count: 1,
          agents: [{ sId: agent.sId }],
        },
      },
    });
  });

  it("should return usage for skills linked via linkGlobalSkillToAgent", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent With Frames",
    });

    await SkillFactory.linkGlobalSkillToAgent(auth, {
      globalSkillId: "frames",
      agentConfigurationId: agent.id,
    });

    const response = await getSkills(workspace, { withRelations: "true" });

    expect(response.status).toBe(200);

    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsWithRelationsType) =>
        s.sId === "frames"
    );

    expect(skillResult).toMatchObject({
      relations: {
        usage: {
          count: 1,
          agents: [{ sId: agent.sId }],
        },
      },
    });
  });

  it("should return empty usage when skill has no agents", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillFactory.create(auth, {
      name: "Skill Without Agents",
    });

    const response = await getSkills(workspace, { withRelations: "true" });

    expect(response.status).toBe(200);

    const skillId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsWithRelationsType) =>
        s.sId === skillId
    );

    expect(skillResult).toMatchObject({
      relations: {
        usage: { count: 0, agents: [], skills: [] },
      },
    });
    expect(skillResult).not.toHaveProperty("messageCount");
  });

  it("should return child skills", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const { parentSkill, childSkill } =
      await SkillFactory.createWithNestedSkill(auth, {
        childOverrides: {
          name: "Child Skill",
        },
        parentOverrides: {
          name: "Parent Skill",
        },
      });

    const response = await getSkills(workspace, { withRelations: "true" });

    expect(response.status).toBe(200);

    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsWithRelationsType) =>
        s.sId === parentSkill.sId
    );

    expect(skillResult).toMatchObject({
      relations: {
        childSkills: [
          {
            sId: childSkill.sId,
            name: "Child Skill",
          },
        ],
      },
    });
    expect(skillResult.relations.childSkills[0]).not.toHaveProperty(
      "instructions"
    );
  });

  it("should return skills that reference a skill", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const { childSkill, parentSkill } =
      await SkillFactory.createWithNestedSkill(auth, {
        childOverrides: {
          name: "Referenced Skill",
        },
        parentOverrides: {
          name: "Parent Skill",
        },
      });

    const response = await getSkills(workspace, { withRelations: "true" });

    expect(response.status).toBe(200);

    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsWithRelationsType) =>
        s.sId === childSkill.sId
    );

    expect(skillResult).toMatchObject({
      relations: {
        usage: {
          count: 1,
          agents: [],
          skills: [
            {
              sId: parentSkill.sId,
              name: "Parent Skill",
              icon: parentSkill.icon,
            },
          ],
        },
      },
    });
  });

  it("should return skills without usage when withRelations is not set", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillFactory.create(auth, {
      name: "Skill Without Relations",
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);

    const skillId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsType) => s.sId === skillId
    );

    expect(skillResult).toBeDefined();
    expect(skillResult).not.toHaveProperty("usage");
  });

  it("should return usage with multiple agents sorted by name", async () => {
    const { workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillFactory.create(auth, { name: "Popular Skill" });

    const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent Alpha",
    });
    const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent Beta",
    });

    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent1.id,
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent2.id,
    });

    const response = await getSkills(workspace, { withRelations: "true" });

    expect(response.status).toBe(200);

    const skillId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = (await response.json()).skills.find(
      (s: SkillWithoutInstructionsAndToolsWithRelationsType) =>
        s.sId === skillId
    );

    expect(skillResult).toMatchObject({
      relations: {
        usage: {
          count: 2,
          agents: [{ name: "Agent Alpha" }, { name: "Agent Beta" }],
        },
      },
    });
  });
});

describe("POST /api/w/:wId/skills", () => {
  it("creates a simple skill configuration", async () => {
    const { auth, workspace } = await setupTest("admin");

    const response = await postSkill(workspace, {
      name: "Simple Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A simple skill without tools",
      instructions: "Simple instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.skill).toMatchObject({
      name: "Simple Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A simple skill without tools",
      instructions: "Simple instructions",
      status: "active",
      tools: [],
    });

    const createdSkill = await SkillResource.fetchById(
      auth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
  });

  it("defaults new skills to unpublished, without requiring the publish permission", async () => {
    const { workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const response = await postSkill(workspace, {
      name: "Draft Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A skill",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.skill.availability).toBe("editors");
  });

  it("requires the publish permission to create a published skill", async () => {
    const { workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const response = await postSkill(workspace, {
      name: "Published Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A skill",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      availability: "workspace_users",
    });

    expect(response.status).toBe(403);
  });

  it("requires the make-discoverable permission to create an auto-discoverable skill", async () => {
    const { workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const publisherGroup = await GroupFactory.regularAuto(
      workspace,
      `skill-publisher-${user.sId}`
    );
    await GroupFactory.withMembers(adminAuth, publisherGroup, [user]);
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group: publisherGroup,
      grantType: "publish",
      resourceType: "skill",
    });

    const body = {
      name: "Auto-discoverable Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A skill",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      availability: "users_and_agents",
    };

    let response = await postSkill(workspace, body);
    expect(response.status).toBe(403);

    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group: publisherGroup,
      grantType: "make_discoverable",
      resourceType: "skill",
    });

    response = await postSkill(workspace, body);
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.skill.availability).toBe("users_and_agents");
  });

  it("lets an admin create a published skill", async () => {
    const { workspace } = await setupTest("admin");

    const response = await postSkill(workspace, {
      name: "Published Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A skill",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      availability: "users_and_agents",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.skill.availability).toBe("users_and_agents");
  });

  it("creates skill references", async () => {
    const { auth, workspace } = await setupTest("admin");

    const childSkill = await SkillFactory.create(auth, {
      name: "Referenced Skill",
    });

    const response = await postSkill(workspace, {
      name: "Parent Skill",
      agentFacingDescription: "To use with another skill",
      userFacingDescription: "A skill with a nested reference",
      instructions: `Start with ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);

    const createdSkill = await SkillResource.fetchById(
      auth,
      (await response.json()).skill.sId
    );
    expect(createdSkill).not.toBeNull();

    await expect(createdSkill!.fetchChildSkills(auth)).resolves.toEqual([
      expect.objectContaining({
        sId: childSkill.sId,
      }),
    ]);
  });

  it("adds requested spaces from nested skill references", async () => {
    const { auth, workspace, globalGroup } = await setupTest("admin");

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);

    const childSkill = await SkillFactory.create(auth, {
      name: "Referenced Pod Skill",
      requestedSpaceIds: [openSpace.id],
    });

    const response = await postSkill(workspace, {
      name: "Parent Skill",
      agentFacingDescription: "To use with another skill",
      userFacingDescription: "A skill with a nested reference",
      instructions: `Start with ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.requestedSpaceIds).toContain(openSpace.sId);
    expect(data.skill.instructions).not.toContain("<unavailable_skill");

    const createdSkill = await SkillResource.fetchById(auth, data.skill.sId);
    if (!createdSkill) {
      throw new Error("Expected created skill to be found.");
    }
    expect(createdSkill.requestedSpaceIds).toContain(openSpace.id);
    expect(createdSkill.instructions).not.toContain("<unavailable_skill");
  });

  it("drops missing nested skill references", async () => {
    const { auth, workspace } = await setupTest("admin");

    const response = await postSkill(workspace, {
      name: "Parent Skill",
      agentFacingDescription: "To use with another skill",
      userFacingDescription: "A skill with an invalid nested reference",
      instructions:
        'Start with <skill id="not-a-skill-reference" name="Ghost Skill" />.',
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    const createdSkill = await SkillResource.fetchById(auth, data.skill.sId);
    expect(createdSkill).not.toBeNull();

    await expect(createdSkill!.fetchChildSkills(auth)).resolves.toHaveLength(0);
  });

  it("creates a skill configuration with additional requested spaces", async () => {
    const { auth, workspace, globalGroup } = await setupTest("admin");

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);
    // An open space confers read through the global group's `reader` grant, and an Authenticator
    // resolves its grants once, at construction. `auth` predates the space, so refresh it before
    // reading a skill that requests it — `SkillResource` drops skills whose spaces it cannot read.
    await auth.refresh();

    const response = await postSkill(workspace, {
      name: "Skill With Additional Space",
      agentFacingDescription: "To use with an additional space",
      userFacingDescription: "A skill with a selected space",
      instructions: "Simple instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [openSpace.sId],
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.skill).toMatchObject({
      name: "Skill With Additional Space",
      requestedSpaceIds: [openSpace.sId],
    });

    const createdSkill = await SkillResource.fetchById(
      auth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.requestedSpaceIds).toContain(openSpace.id);
  });

  it("rejects additional requested spaces the user cannot access", async () => {
    const { workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const restrictedSpace = await SpaceFactory.regular(workspace);

    const response = await postSkill(workspace, {
      name: "Skill With Restricted Additional Space",
      agentFacingDescription: "To use with a restricted space",
      userFacingDescription: "A skill with a selected space",
      instructions: "Simple instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [restrictedSpace.sId],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: `User does not have access to the following spaces: ${restrictedSpace.sId}`,
      },
    });
  });

  it("allows restricting a skill to an open Pod the user can access", async () => {
    const { workspace, globalGroup, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const openPod = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(openPod, globalGroup);

    const response = await postSkill(workspace, {
      name: "Skill Restricted To Open Pod",
      agentFacingDescription: "To use with an open Pod",
      userFacingDescription: "A skill with a selected Pod",
      instructions: "Simple instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [openPod.sId],
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.skill.requestedSpaceIds).toContain(openPod.sId);
  });

  it("creates a skill configuration with 2 tools", async () => {
    const { workspace, auth, user, globalSpace } = await setupTest("admin");

    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "Server 1",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "Server 2",
    });

    const serverView1 = await MCPServerViewFactory.create(
      workspace,
      server1.sId,
      globalSpace
    );
    const serverView2 = await MCPServerViewFactory.create(
      workspace,
      server2.sId,
      globalSpace
    );

    const response = await postSkill(workspace, {
      name: "Test Skill",
      agentFacingDescription: "Use this skill all the time",
      userFacingDescription: "A test skill description",
      instructions: "Test instructions for the skill",
      icon: "PuzzleIcon",
      tools: [
        { mcpServerViewId: serverView1.sId },
        { mcpServerViewId: serverView2.sId },
      ],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.skill).toMatchObject({
      name: "Test Skill",
      agentFacingDescription: "Use this skill all the time",
      userFacingDescription: "A test skill description",
      instructions: "Test instructions for the skill",
      status: "active",
      tools: [serverView1.toJSON(), serverView2.toJSON()],
    });

    const createdSkill = await SkillResource.fetchById(
      auth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.agentFacingDescription).toBe(
      "Use this skill all the time"
    );
    expect(createdSkill!.instructions).toBe("Test instructions for the skill");
    expect(createdSkill!.editedBy).toBe(user.id);

    const toolConfigurations = await SkillMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: createdSkill!.id,
      },
    });
    expect(toolConfigurations).toHaveLength(2);

    const serverViewIds = toolConfigurations.map((t) => t.mcpServerViewId);
    const view1 = await MCPServerViewResource.fetchById(auth, serverView1.sId);
    const view2 = await MCPServerViewResource.fetchById(auth, serverView2.sId);
    expect(serverViewIds).toContain(view1!.id);
    expect(serverViewIds).toContain(view2!.id);
  });

  it("creates a skill configuration with requestedSpaceIds derived from tool's space", async () => {
    const { auth, workspace, user } = await setupTest("admin");

    const regularSpace = await SpaceFactory.regular(workspace);
    // Membership on a manually-managed space comes from its own auto-created member group.
    const [memberGroup] = await regularSpace.fetchRegularAutoGroups(auth);
    await GroupFactory.withMembers(auth, memberGroup, [user]);
    const spaceMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Server in Regular Space",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      regularSpace
    );

    const response = await postSkill(workspace, {
      name: "Skill With Space Restrictions",
      agentFacingDescription: "A skill restricted to specific spaces",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [{ mcpServerViewId: serverView.sId }],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.skill).toMatchObject({
      name: "Skill With Space Restrictions",
      requestedSpaceIds: [regularSpace.sId],
    });

    const createdSkill = await SkillResource.fetchById(
      spaceMemberAuth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.requestedSpaceIds).toEqual([regularSpace.id]);
  });

  it("creates a skill with attached knowledge", async () => {
    const { auth, workspace, user, globalSpace } = await setupTest("admin");

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      user
    );

    const dataSourceView1 = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      user
    );

    const response = await postSkill(workspace, {
      name: "Skill with Knowledge",
      agentFacingDescription: "A skill with knowledge attachments",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      instructionsHtml: null,
      attachedKnowledge: [
        {
          dataSourceViewId: dataSourceView.sId,
          nodeId: "node1",
          nodeType: "document",
          spaceId: dataSourceView.space.sId,
          title: "Document Node 1",
        },
        {
          dataSourceViewId: dataSourceView1.sId,
          nodeId: "node2",
          nodeType: "folder",
          spaceId: dataSourceView1.space.sId,
          title: "Folder Node 2",
        },
      ],
    });

    expect(response.status).toBe(200);

    const skillId = (await response.json()).skill.sId;

    const createdSkill = await SkillResource.fetchById(auth, skillId);
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.dataSourceConfigurations).toHaveLength(2);
  });

  it("creates a skill with requestedSpaceIds derived from attached knowledge's space", async () => {
    const { auth, workspace, user } = await setupTest("admin");

    const regularSpace = await SpaceFactory.regular(workspace);
    // Membership on a manually-managed space comes from its own auto-created member group.
    const [memberGroup] = await regularSpace.fetchRegularAutoGroups(auth);
    await GroupFactory.withMembers(auth, memberGroup, [user]);
    const spaceMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      regularSpace,
      user
    );

    const nodeId = "node1";
    const title = "Document from restricted space";

    const response = await postSkill(workspace, {
      name: "Skill With Knowledge From Restricted Space",
      agentFacingDescription: "A skill with knowledge from a restricted space",
      userFacingDescription: "User description",
      instructions: `Read file: <knowledge id="${nodeId}" title="${title}" space="${regularSpace.sId}" dsv="${dataSourceView.sId}" hasChildren="false" />`,
      icon: "PuzzleIcon",
      tools: [],
      instructionsHtml: null,
      attachedKnowledge: [
        {
          dataSourceViewId: dataSourceView.sId,
          nodeId,
          nodeType: "document",
          spaceId: regularSpace.sId,
          title,
        },
      ],
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.skill).toMatchObject({
      name: "Skill With Knowledge From Restricted Space",
      requestedSpaceIds: [regularSpace.sId],
    });

    const createdSkill = await SkillResource.fetchById(
      spaceMemberAuth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.requestedSpaceIds).toEqual([regularSpace.id]);
  });
});

describe("POST /api/w/:wId/skills - file attachments", () => {
  it("creates a skill with file attachments", async () => {
    const { auth, workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const file1 = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 100,
      status: "ready",
      useCase: "skill_attachment",
    });
    const file2 = await FileFactory.create(auth, user, {
      contentType: "application/json",
      fileName: "schema.json",
      fileSize: 200,
      status: "ready",
      useCase: "skill_attachment",
    });

    const response = await postSkill(workspace, {
      name: "Skill With Files",
      agentFacingDescription: "A skill with file attachments",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      fileAttachments: [{ fileId: file1.sId }, { fileId: file2.sId }],
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.skill.fileAttachments).toHaveLength(2);

    const fileNames = data.skill.fileAttachments.map(
      (f: { fileName: string }) => f.fileName
    );
    expect(fileNames).toContain("template.txt");
    expect(fileNames).toContain("schema.json");

    const createdSkill = await SkillResource.fetchById(auth, data.skill.sId);
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.toJSON(auth).fileAttachments).toHaveLength(2);
  });

  it("succeeds without file attachments", async () => {
    const { workspace } = await setupTest("admin");

    const response = await postSkill(workspace, {
      name: "Skill Without Files",
      agentFacingDescription: "A normal skill",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).skill.fileAttachments).toHaveLength(0);
  });

  it("rejects file attachments with wrong use case", async () => {
    const { auth, workspace, user } = await setupTest("admin");

    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "conversation-file.txt",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postSkill(workspace, {
      name: "Skill With Wrong File",
      agentFacingDescription: "Description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      fileAttachments: [{ fileId: file.sId }],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "not ready or not a skill_attachment"
    );
  });
});
