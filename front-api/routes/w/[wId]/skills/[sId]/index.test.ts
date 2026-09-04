import { Authenticator } from "@app/lib/auth";
import {
  SkillFileAttachmentModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import type { WhereOptions } from "sequelize";
import { describe, expect, it } from "vitest";

async function setupTest(
  options: {
    skillOwnerRole?: MembershipRoleType;
    requestUserRole?: MembershipRoleType;
  } = {}
) {
  const skillOwnerRole = options.skillOwnerRole ?? "admin";
  const requestUserRole = options.requestUserRole ?? "admin";

  const {
    auth,
    globalGroup,
    workspace,
    globalSpace,
    user: requestUser,
  } = await createPrivateApiMockRequest({ role: requestUserRole });

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

  skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    skillOwner.sId,
    workspace.sId
  );
  requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  return {
    auth,
    requestUser,
    requestUserAuth,
    skill,
    skillOwner,
    skillOwnerAuth,
    globalSpace,
    globalGroup,
    workspace,
  };
}

function getSkill(workspace: { sId: string }, sId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}`);
}

function getSkillWithRelations(workspace: { sId: string }, sId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/${sId}?withRelations=true`
  );
}

function patchSkill(workspace: { sId: string }, sId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteSkill(workspace: { sId: string }, sId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}`, {
    method: "DELETE",
  });
}

describe("GET /api/w/:wId/skills/:sId", () => {
  it("should return 200 and the skill configuration for admin", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await getSkill(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("skill");
    expect(data.skill.sId).toBe(skill.sId);
    expect(data.skill.name).toBe("Test Skill");
  });

  it("should hide instructions for a code-defined skill that has not opted in", async () => {
    // Code-defined skills hide their prompt from the front-end by default; only
    // skills that set exposeInstructions (e.g. docs/pptx/xlsx) surface it. Frames
    // is intentionally kept opaque.
    const { workspace } = await setupTest({ requestUserRole: "admin" });

    const response = await getSkill(workspace, "frames");

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.sId).toBe("frames");
    expect(data.skill.instructions).toBeNull();
    expect(data.skill.instructionsHtml).toBeNull();
  });

  it("should expose instructions for an opted-in code-defined skill", async () => {
    // pptx sets exposeInstructions: true, so its prompt is surfaced on the detail
    // fetch as plain markdown (instructionsHtml stays null).
    const { workspace } = await setupTest({
      requestUserRole: "admin",
    });

    const response = await getSkill(workspace, "pptx");

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.sId).toBe("pptx");
    expect(typeof data.skill.instructions).toBe("string");
    expect(data.skill.instructions.length).toBeGreaterThan(0);
    expect(data.skill.instructionsHtml).toBeNull();
  });

  it("should return child skills", async () => {
    const { workspace, skill, skillOwnerAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const childSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Child Skill",
    });
    await SkillFactory.updateNestedSkillReferences(skillOwnerAuth, {
      parentSkill: skill,
      childSkills: [childSkill],
    });

    const response = await getSkillWithRelations(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.skill.relations.childSkills).toEqual([
      expect.objectContaining({
        sId: childSkill.sId,
        name: "Child Skill",
      }),
    ]);
    expect(data.skill.relations.childSkills[0]).not.toHaveProperty(
      "instructions"
    );
    expect(data.skill.relations.usage.skills).toEqual([]);
  });

  it("should not expose favorite state when the feature flag is disabled", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const result = await skill.setFavorite(requestUserAuth, true);
    expect(result.isOk()).toBe(true);

    const response = await getSkill(workspace, skill.sId);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill).not.toHaveProperty("isFavorite");

    const relationsResponse = await getSkillWithRelations(workspace, skill.sId);
    expect(relationsResponse.status).toBe(200);
    const relationsData = await relationsResponse.json();
    expect(relationsData.skill).not.toHaveProperty("isFavorite");
  });

  it("should include favorite state when the feature flag is enabled", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });
    await FeatureFlagFactory.basic(requestUserAuth, "skill_favorites");

    const result = await skill.setFavorite(requestUserAuth, true);
    expect(result.isOk()).toBe(true);

    const response = await getSkill(workspace, skill.sId);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.isFavorite).toBe(true);
  });

  it("redacts the private fields of a skill built on a space the admin cannot read", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [skillOwner.sId] });
    const restrictedSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Restricted Space Skill",
      instructions: "Secret guidelines",
      requestedSpaceIds: [restrictedSpace.id],
    });
    // Give the skill a tool and a file, so the redaction is tested on real data.
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Restricted Server",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      restrictedSpace
    );
    const file = await FileFactory.create(skillOwnerAuth, skillOwner, {
      contentType: "text/plain",
      fileName: "secret.txt",
      fileSize: 100,
      status: "ready",
      useCase: "skill_attachment",
    });
    await restrictedSkill.updateSkill(skillOwnerAuth, {
      name: restrictedSkill.name,
      agentFacingDescription: restrictedSkill.agentFacingDescription,
      userFacingDescription: restrictedSkill.userFacingDescription,
      instructions: "Secret guidelines",
      icon: null,
      attachedKnowledge: [],
      mcpServerViews: [serverView],
      fileAttachments: [file],
      requestedSpaceIds: [restrictedSpace.id],
      manuallyRequestedSpaceIds: [],
    });
    const ownerView = await getSkill(workspace, restrictedSkill.sId);
    // Sanity check on the fixture through the owner's own resource: the private data is there.
    const ownerSkill = (
      await SkillResource.fetchByIds(skillOwnerAuth, [restrictedSkill.sId])
    )[0];
    expect(ownerSkill.toJSON(skillOwnerAuth).tools).toHaveLength(1);
    expect(ownerSkill.toJSON(skillOwnerAuth).fileAttachments).toHaveLength(1);
    expect(ownerView.status).toBe(200);

    const response = await getSkill(workspace, restrictedSkill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.sId).toBe(restrictedSkill.sId);
    expect(data.skill.name).toBe("Restricted Space Skill");
    expect(data.skill.canRead).toBe(false);
    // Not an editor, but an admin: archiving and availability changes stay possible.
    expect(data.skill.canWrite).toBe(false);
    expect(data.skill.canAdministrate).toBe(true);
    expect(data.skill.instructions).toBeNull();
    expect(data.skill.instructionsHtml).toBeNull();
    expect(data.skill.tools).toEqual([]);
    expect(data.skill.fileAttachments).toEqual([]);

    // The details sheet also asks for the relations (editors, usage): they stay available.
    const withRelationsResponse = await getSkillWithRelations(
      workspace,
      restrictedSkill.sId
    );
    expect(withRelationsResponse.status).toBe(200);
    const withRelations = await withRelationsResponse.json();
    expect(withRelations.skill.canRead).toBe(false);
    expect(withRelations.skill.instructions).toBeNull();
    expect(
      withRelations.skill.relations.editors.map((e: { sId: string }) => e.sId)
    ).toEqual([skillOwner.sId]);
  });

  it("returns 404 for a skill built on a space a non-admin cannot read", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "builder",
    });
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(internalAdminAuth, {
      userIds: [skillOwner.sId],
    });
    const restrictedSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Restricted Space Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await getSkill(workspace, restrictedSkill.sId);

    expect(response.status).toBe(404);
  });

  it("should return 404 for non-existent skill", async () => {
    const { workspace } = await setupTest();

    const response = await getSkill(workspace, "non_existent_skill_sid");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });
});

describe("PATCH /api/w/:wId/skills/:sId", () => {
  it("should return 403 for non-editor user", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "admin",
      requestUserRole: "user",
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: "Unauthorized Update",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can modify this skill.",
      },
    });
  });

  it("should return 400 for an archived skill, which only restore can change", async () => {
    const { workspace, skill, skillOwnerAuth } = await setupTest({
      requestUserRole: "admin",
      skillOwnerRole: "admin",
    });

    await skill.archive(skillOwnerAuth);

    const response = await patchSkill(workspace, skill.sId, {
      name: "Renamed While Archived",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Updated instructions",
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "An archived skill cannot be updated. Restore it first.",
      },
    });

    const untouched = await SkillResource.fetchById(skillOwnerAuth, skill.sId);
    expect(untouched?.name).toBe(skill.name);
    expect(untouched?.instructions).not.toBe("Updated instructions");

    // Restoring is the one change it accepts, and editing works again afterwards.
    const restoreResponse = await honoApp.request(
      `/api/w/${workspace.sId}/skills/${skill.sId}/restore`,
      { method: "POST" }
    );
    expect(restoreResponse.status).toBe(200);

    const patchAfterRestore = await patchSkill(workspace, skill.sId, {
      name: "Renamed After Restore",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Updated instructions",
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });
    expect(patchAfterRestore.status).toBe(200);
  });

  it("should return 400 for duplicate skill name", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    await SkillFactory.create(requestUserAuth, { name: "Other Skill" });

    const response = await patchSkill(workspace, skill.sId, {
      name: "Other Skill",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: 'A skill with the name "Other Skill" already exists.',
      },
    });
  });

  it("should return 400 for invalid MCP server view ID", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await patchSkill(workspace, skill.sId, {
      name: "Updated Skill",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [{ mcpServerViewId: "invalid_id" }],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("Invalid MCP server");
  });

  it("should return 404 when MCP server views not found", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await patchSkill(workspace, skill.sId, {
      name: "Updated Skill",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [{ mcpServerViewId: "msv_nonexistent123456" }],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("MCP server views not all found");
  });

  it("should return 400 for invalid request body", async () => {
    const { workspace, skill } = await setupTest({ requestUserRole: "admin" });

    const response = await patchSkill(workspace, skill.sId, {
      // Missing required fields
      name: "Updated Skill",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("should successfully update the description", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const newDescription = "Updated description for the skill";

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: newDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);
    expect(data).toHaveProperty("skill");
    expect(data.skill.sId).toBe(skill.sId);
    expect(data.skill.agentFacingDescription).toBe(newDescription);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.agentFacingDescription).toBe(newDescription);
  });

  it("updates availability, giving it priority over the deprecated isDefault", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const basePayload = {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    };

    // Old clients still send only isDefault.
    let response = await patchSkill(workspace, skill.sId, {
      ...basePayload,
      isDefault: true,
    });
    expect(response.status).toBe(200);
    let updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.availability).toBe("users_and_agents");

    // New clients send availability; it wins over a contradicting isDefault.
    response = await patchSkill(workspace, skill.sId, {
      ...basePayload,
      isDefault: true,
      availability: "workspace_users",
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.availability).toBe("workspace_users");
    expect(data.skill.isDefault).toBe(false);
    updatedSkill = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(updatedSkill?.availability).toBe("workspace_users");
  });

  it("denies any edit to a non-editor even with the publish permission", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "user",
      requestUserRole: "admin",
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: "Renamed By Admin",
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: skill.icon,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: skill.instructionsHtml,
      availability: "editors",
    });

    expect(response.status).toBe(403);
  });

  it("denies an availability change to an editor without the publish permission", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "user",
      requestUserRole: "user",
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: skill.icon,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: skill.instructionsHtml,
      availability: "users_and_agents",
    });

    expect(response.status).toBe(403);
  });

  it("lets an editor without the publish permission edit when availability is unchanged", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      skillOwnerRole: "user",
      requestUserRole: "user",
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: "Renamed By Editor",
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: skill.icon,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: skill.instructionsHtml,
    });

    expect(response.status).toBe(200);
    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.name).toBe("Renamed By Editor");
  });

  it("recomputes nested skill references from instructions", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const childSkill = await SkillFactory.create(requestUserAuth, {
      name: "Referenced Skill",
    });
    const buildBody = (instructions: string) => ({
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    const addResponse = await patchSkill(
      workspace,
      skill.sId,
      buildBody(`Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`)
    );
    expect(addResponse.status).toBe(200);
    const skillWithReference = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(skillWithReference).not.toBeNull();
    await expect(
      skillWithReference!.fetchChildSkills(requestUserAuth)
    ).resolves.toEqual([
      expect.objectContaining({
        sId: childSkill.sId,
      }),
    ]);

    // Restoring a previous version goes through this same endpoint: saving
    // instructions without the reference tag must clear the denormalized
    // references, even if the client still sends a stale referencedSkillIds.
    const removeResponse = await patchSkill(workspace, skill.sId, {
      ...buildBody("No nested skill references here."),
      referencedSkillIds: [childSkill.sId],
    });
    expect(removeResponse.status).toBe(200);
    const skillWithoutReference = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(skillWithoutReference).not.toBeNull();
    await expect(
      skillWithoutReference!.fetchChildSkills(requestUserAuth)
    ).resolves.toHaveLength(0);
  });

  it("adds requested spaces from nested skill references", async () => {
    const { workspace, skill, requestUserAuth, globalGroup } = await setupTest({
      requestUserRole: "admin",
    });

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);

    const childSkill = await SkillFactory.create(requestUserAuth, {
      name: "Referenced Pod Skill",
      requestedSpaceIds: [openSpace.id],
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.requestedSpaceIds).toContain(openSpace.sId);
    expect(data.skill.instructions).not.toContain("<unavailable_skill");

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    if (!updatedSkill) {
      throw new Error("Expected updated skill to be found.");
    }
    expect(updatedSkill.requestedSpaceIds).toContain(openSpace.id);
    expect(updatedSkill.instructions).not.toContain("<unavailable_skill");
  });

  it("drops missing nested skill references", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const outOfWorkspaceSkillId = SkillResource.modelIdToSId({
      id: skill.id + 1,
      workspaceId: workspace.id + 1,
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: `Use <skill id="${outOfWorkspaceSkillId}" name="Other Workspace Skill" />.`,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();

    await expect(
      updatedSkill!.fetchChildSkills(requestUserAuth)
    ).resolves.toHaveLength(0);
  });

  it("keeps unavailable nested skill references when child spaces are not readable", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const childSkill = await SkillFactory.create(requestUserAuth, {
      name: "Restricted Child Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    await expect(
      SkillResource.fetchById(requestUserAuth, childSkill.sId)
    ).resolves.toBeNull();

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: `Use ${SkillFactory.serializeSkillReferenceTag(childSkill)}.`,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill!.instructions).toContain(
      `<unavailable_skill id="${childSkill.sId}" />`
    );
  });

  it("should update requestedSpaceIds when adding a tool from a new space", async () => {
    const { workspace, skill, requestUser, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const space1 = await SpaceFactory.regular(workspace);
    await space1.addMembers(requestUserAuth, { userIds: [requestUser.sId] });
    const space2 = await SpaceFactory.regular(workspace);
    await space2.addMembers(requestUserAuth, { userIds: [requestUser.sId] });
    await requestUserAuth.refresh();

    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "Server 1",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "Server 2",
    });

    const serverView1 = await MCPServerViewFactory.create(
      workspace,
      server1.sId,
      space1
    );
    const serverView2 = await MCPServerViewFactory.create(
      workspace,
      server2.sId,
      space2
    );

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [
        { mcpServerViewId: serverView1.sId },
        { mcpServerViewId: serverView2.sId },
      ],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);
    expect(data.skill.tools).toHaveLength(2);
    expect(data.skill.requestedSpaceIds).toHaveLength(2);
    expect(data.skill.requestedSpaceIds).toContain(space1.sId);
    expect(data.skill.requestedSpaceIds).toContain(space2.sId);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.requestedSpaceIds).toHaveLength(2);
  });

  it("should include additionalRequestedSpaceIds when updating a skill", async () => {
    const { workspace, skill, requestUserAuth, globalGroup } = await setupTest({
      requestUserRole: "admin",
    });

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);
    // An open space confers read through the global group's `reader` grant, and an Authenticator
    // resolves its grants once, at construction. `requestUserAuth` predates the space, so refresh
    // it before reading a skill that requests it — `SkillResource` drops skills whose spaces it
    // cannot read.
    await requestUserAuth.refresh();

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [openSpace.sId],
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);
    expect(data.skill.requestedSpaceIds).toContain(openSpace.sId);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.requestedSpaceIds).toContain(openSpace.id);
  });

  it("rejects a restricted space that an existing editor cannot access", async () => {
    const { workspace, skill, requestUser, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    // Restricted: no global group is associated with it.
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await restrictedSpace.addMembers(adminAuth, {
      userIds: [requestUser.sId],
    });

    const coEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, coEditor, { role: "user" });
    const addRes = await skill.addEditors(requestUserAuth, [coEditor]);
    if (addRes.isErr()) {
      throw new Error("Failed to add the co-editor");
    }

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [restrictedSpace.sId],
    });

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.message).toContain("do not have access");
    expect(error.message).toContain(restrictedSpace.name);

    // The skill was not updated.
    const unchangedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(unchangedSkill?.requestedSpaceIds).not.toContain(restrictedSpace.id);
  });

  it("accepts a restricted space that every editor can access", async () => {
    const { workspace, skill, requestUser, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const coEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, coEditor, { role: "user" });
    await restrictedSpace.addMembers(adminAuth, {
      userIds: [requestUser.sId, coEditor.sId],
    });

    const addRes = await skill.addEditors(requestUserAuth, [coEditor]);
    if (addRes.isErr()) {
      throw new Error("Failed to add the co-editor");
    }

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [restrictedSpace.sId],
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);
    expect(data.skill.requestedSpaceIds).toContain(restrictedSpace.sId);
  });

  it("should preserve existing additional requested spaces when omitted", async () => {
    const { workspace, skill, requestUserAuth, globalGroup } = await setupTest({
      requestUserRole: "admin",
    });

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);

    // The space was picked by hand, which is what the write paths now record alongside the union.
    await skill.updateSkill(requestUserAuth, {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      icon: skill.icon,
      instructions: skill.instructions,
      instructionsHtml: skill.instructionsHtml,
      manuallyRequestedSpaceIds: [openSpace.id],
      mcpServerViews: [],
      name: skill.name,
      requestedSpaceIds: [openSpace.id],
      userFacingDescription: skill.userFacingDescription,
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);
    expect(data.skill.requestedSpaceIds).toContain(openSpace.sId);
  });

  it("should not preserve self-reference spaces when explicitly removed", async () => {
    const { workspace, skill, requestUserAuth, globalGroup } = await setupTest({
      requestUserRole: "admin",
    });

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);

    const selfReferenceInstructions = `Recurse with ${SkillFactory.serializeSkillReferenceTag(skill)}.`;

    await skill.updateSkill(requestUserAuth, {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      icon: skill.icon,
      instructions: selfReferenceInstructions,
      instructionsHtml: skill.instructionsHtml,
      mcpServerViews: [],
      name: skill.name,
      manuallyRequestedSpaceIds: [],
      requestedSpaceIds: [openSpace.id],
      userFacingDescription: skill.userFacingDescription,
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: selfReferenceInstructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      additionalRequestedSpaceIds: [],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.requestedSpaceIds).not.toContain(openSpace.sId);
    expect(data.skill.instructions).not.toContain("<unavailable_skill");
  });

  it("should correctly reflect updated tools in the response", async () => {
    const { workspace, skill, requestUser, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const space = await SpaceFactory.regular(workspace);
    await space.addMembers(requestUserAuth, { userIds: [requestUser.sId] });
    await requestUserAuth.refresh();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      space
    );

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [{ mcpServerViewId: serverView.sId }],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);

    expect(data.skill.tools).toHaveLength(1);
    expect(data.skill.tools[0].sId).toBe(serverView.sId);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.toJSON(requestUserAuth).tools).toHaveLength(1);
    expect(updatedSkill?.toJSON(requestUserAuth).tools[0].sId).toBe(
      serverView.sId
    );
  });

  it("should successfully update attached knowledge", async () => {
    const { workspace, skill, requestUserAuth, requestUser, globalSpace } =
      await setupTest({ requestUserRole: "admin" });

    const dataSourceView1 = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      requestUser
    );
    const dataSourceView2 = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      requestUser
    );

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      instructionsHtml: null,
      attachedKnowledge: [
        {
          dataSourceViewId: dataSourceView1.sId,
          nodeId: "folder1",
          nodeType: "folder",
          spaceId: dataSourceView1.space.sId,
          title: "Folder 1",
        },
        {
          dataSourceViewId: dataSourceView2.sId,
          nodeId: "folder2",
          nodeType: "folder",
          spaceId: dataSourceView2.space.sId,
          title: "Folder 2",
        },
      ],
    });

    expect(response.status).toBe(200);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.dataSourceConfigurations).toHaveLength(2);
  });
});

describe("PATCH /api/w/:wId/skills/:sId - manually requested spaces", () => {
  // Sets up an open space the request user can read, plus a folder in it so knowledge attached
  // from that space makes it required automatically as well as manually.
  async function setupSpaceWithKnowledge(options: {
    requestUserRole: "admin";
  }) {
    const test = await setupTest(options);
    const { workspace, globalGroup, requestUserAuth, requestUser } = test;

    const space = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(space, globalGroup);
    // An open space confers read through the global group's `reader` grant, and an Authenticator
    // resolves its grants once, at construction.
    await requestUserAuth.refresh();

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      space,
      requestUser
    );

    return { ...test, space, dataSourceView };
  }

  function patchBody(
    skill: {
      name: string;
      agentFacingDescription: string;
      userFacingDescription: string;
      instructions: string;
    },
    overrides: Record<string, unknown>
  ) {
    return {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      ...overrides,
    };
  }

  function knowledge(dataSourceView: { sId: string }, space: { sId: string }) {
    return [
      {
        dataSourceViewId: dataSourceView.sId,
        nodeId: "folder1",
        spaceId: space.sId,
        title: "Folder 1",
      },
    ];
  }

  it("stores the manually selected spaces, and snapshots them on the version", async () => {
    const { workspace, skill, requestUserAuth, space } =
      await setupSpaceWithKnowledge({ requestUserRole: "admin" });

    const response = await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, { additionalRequestedSpaceIds: [space.sId] })
    );
    expect(await response.json()).not.toHaveProperty("error");

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.manuallyRequestedSpaceIds).toEqual([space.id]);
    expect(updatedSkill?.requestedSpaceIds).toContain(space.id);

    // Patch again so a version is snapshotted from the state above.
    await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, { additionalRequestedSpaceIds: [space.sId] })
    );
    const versionWhere: WhereOptions<SkillVersionModel> = {
      workspaceId: workspace.id,
      skillConfigurationId: skill.id,
    };
    const versions = await SkillVersionModel.findAll({ where: versionWhere });
    expect(
      versions.some((version) =>
        version.manuallyRequestedSpaceIds.includes(space.id)
      )
    ).toBe(true);
  });

  it("keeps a manual space that attached knowledge also requires", async () => {
    const { workspace, skill, requestUserAuth, space, dataSourceView } =
      await setupSpaceWithKnowledge({ requestUserRole: "admin" });

    // Manually selected AND required by knowledge
    const response = await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, {
        additionalRequestedSpaceIds: [space.sId],
        attachedKnowledge: knowledge(dataSourceView, space),
      })
    );
    expect(await response.json()).not.toHaveProperty("error");

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.manuallyRequestedSpaceIds).toEqual([space.id]);
    expect(updatedSkill?.requestedSpaceIds).toContain(space.id);
  });

  it("keeps a manual space after the knowledge from it is removed", async () => {
    const { workspace, skill, requestUserAuth, space, dataSourceView } =
      await setupSpaceWithKnowledge({ requestUserRole: "admin" });

    // Select the space by hand, then attach knowledge from it.
    await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, { additionalRequestedSpaceIds: [space.sId] })
    );
    await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, {
        additionalRequestedSpaceIds: [space.sId],
        attachedKnowledge: knowledge(dataSourceView, space),
      })
    );

    // Remove the knowledge. The space was picked by hand, so it stays.
    const response = await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, { additionalRequestedSpaceIds: [space.sId] })
    );
    expect(await response.json()).not.toHaveProperty("error");

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.requestedSpaceIds).toContain(space.id);
    expect(updatedSkill?.manuallyRequestedSpaceIds).toEqual([space.id]);
  });

  it("drops a knowledge-only space when its last knowledge item is removed", async () => {
    const { workspace, skill, requestUserAuth, space, dataSourceView } =
      await setupSpaceWithKnowledge({ requestUserRole: "admin" });

    await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, {
        additionalRequestedSpaceIds: [],
        attachedKnowledge: knowledge(dataSourceView, space),
      })
    );

    const withKnowledge = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(withKnowledge?.requestedSpaceIds).toContain(space.id);

    const response = await patchSkill(
      workspace,
      skill.sId,
      patchBody(skill, { additionalRequestedSpaceIds: [] })
    );
    expect(await response.json()).not.toHaveProperty("error");

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill?.requestedSpaceIds).not.toContain(space.id);
    expect(updatedSkill?.manuallyRequestedSpaceIds).toEqual([]);
  });
});

describe("PATCH /api/w/:wId/skills/:sId - Suggested skill activation", () => {
  it("should activate a suggested skill and set the author when saving", async () => {
    const { workspace, user: requestUser } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });

    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);

    const suggestedSkill = await SkillFactory.create(adminAuth, {
      name: "Suggested Skill",
      status: "suggested",
    });

    expect(suggestedSkill.status).toBe("suggested");
    expect(suggestedSkill.editedBy).toBeNull();

    const response = await patchSkill(workspace, suggestedSkill.sId, {
      name: "Activated Skill",
      agentFacingDescription: "Updated agent description",
      userFacingDescription: "Updated user description",
      instructions: "Updated instructions",
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("skill");
    expect(data.skill.status).toBe("active");
    expect(data.skill.editedBy).toBe(requestUser.id);

    const updatedSkill = await SkillResource.fetchById(
      adminAuth,
      suggestedSkill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.status).toBe("active");
    expect(updatedSkill?.editedBy).toBe(requestUser.id);

    const where: WhereOptions<SkillVersionModel> = {
      workspaceId: workspace.id,
      skillConfigurationId: updatedSkill!.id,
    };
    const versions = await SkillVersionModel.findAll({ where });
    expect(versions).toHaveLength(1);
    expect(versions[0].editedBy).toBeNull();
  });
});

describe("PATCH /api/w/:wId/skills/:sId - file attachments", () => {
  it("should update file attachments", async () => {
    const { auth, workspace, skill, requestUser, requestUserAuth } =
      await setupTest({
        skillOwnerRole: "user",
        requestUserRole: "user",
      });

    const file = await FileFactory.create(auth, requestUser, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 100,
      status: "ready",
      useCase: "skill_attachment",
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      fileAttachments: [{ fileId: file.sId }],
    });

    const data = await response.json();
    expect(data).not.toHaveProperty("error");
    expect(response.status).toBe(200);
    expect(data.skill.fileAttachments).toHaveLength(1);
    expect(data.skill.fileAttachments[0].fileName).toBe("template.txt");

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill!.toJSON(requestUserAuth).fileAttachments).toHaveLength(
      1
    );
  });

  it("should succeed without file attachments", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "user",
      requestUserRole: "user",
    });

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: "Updated description",
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
  });

  it("should remove file attachments when updating with empty array", async () => {
    const { auth, workspace, skill, requestUser, requestUserAuth } =
      await setupTest({
        skillOwnerRole: "user",
        requestUserRole: "user",
      });

    const file = await FileFactory.create(auth, requestUser, {
      contentType: "text/plain",
      fileName: "to-remove.txt",
      fileSize: 100,
      status: "ready",
      useCase: "skill_attachment",
    });

    await skill.updateSkill(requestUserAuth, {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      fileAttachments: [file],
      icon: null,
      instructions: skill.instructions,
      mcpServerViews: [],
      name: skill.name,
      manuallyRequestedSpaceIds: [],
      requestedSpaceIds: [],
      userFacingDescription: skill.userFacingDescription,
    });

    const skillAfterAdd = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(skillAfterAdd!.toJSON(requestUserAuth).fileAttachments).toHaveLength(
      1
    );

    const response = await patchSkill(workspace, skill.sId, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      fileAttachments: [],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skill.fileAttachments).toHaveLength(0);

    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill!.toJSON(requestUserAuth).fileAttachments).toHaveLength(
      0
    );

    const remainingAttachments = await SkillFileAttachmentModel.findAll({
      where: { skillConfigurationId: skill.id, workspaceId: workspace.id },
    });
    expect(remainingAttachments).toHaveLength(0);
  });
});

describe("DELETE /api/w/:wId/skills/:sId", () => {
  it("lets an admin archive a skill built on a space they cannot read", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [skillOwner.sId] });
    const restrictedSkill = await SkillFactory.create(skillOwnerAuth, {
      name: "Restricted Space Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await deleteSkill(workspace, restrictedSkill.sId);

    expect(response.status).toBe(200);
    const [archived] = await SkillResource.fetchByIds(skillOwnerAuth, [
      restrictedSkill.sId,
    ]);
    expect(archived.status).toBe("archived");
  });

  it("should return 403 for non-editor user", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "admin",
      requestUserRole: "user",
    });

    const response = await deleteSkill(workspace, skill.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only admins and editors can archive this skill.",
      },
    });
  });

  it("refuses to re-archive an already archived skill", async () => {
    const { workspace, requestUserAuth, skill, skillOwnerAuth } =
      await setupTest({
        requestUserRole: "admin",
        skillOwnerRole: "admin",
      });

    await skill.archive(skillOwnerAuth);

    const response = await deleteSkill(workspace, skill.sId);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "An archived skill cannot be updated. Restore it first.",
      },
    });

    // Archiving twice used to rename the skill after itself: `archive` timestamps the same-named
    // archived skill it finds, which is this one.
    const untouched = await SkillResource.fetchById(requestUserAuth, skill.sId);
    expect(untouched?.name).toBe(skill.name);
    expect(untouched?.status).toBe("archived");
  });

  it("allows a workspace admin to archive a skill they do not edit", async () => {
    const { workspace, requestUserAuth, skill } = await setupTest({
      skillOwnerRole: "user",
      requestUserRole: "admin",
    });

    const response = await deleteSkill(workspace, skill.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const archivedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(archivedSkill?.status).toBe("archived");
  });

  it("should return 404 for non-existent skill", async () => {
    const { workspace } = await setupTest();

    const response = await deleteSkill(workspace, "non_existent_skill_sid");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });

  it("should successfully archive a suggested skill", async () => {
    const { workspace, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const suggestedSkill = await SkillFactory.create(requestUserAuth, {
      name: "Suggested Skill To Archive",
      status: "suggested",
    });

    expect(suggestedSkill.status).toBe("suggested");

    const response = await deleteSkill(workspace, suggestedSkill.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const archivedSkill = await SkillResource.fetchById(
      requestUserAuth,
      suggestedSkill.sId
    );
    expect(archivedSkill).not.toBeNull();
    expect(archivedSkill?.status).toBe("archived");
  });
});
