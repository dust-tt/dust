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
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import type { WhereOptions } from "sequelize";
import { describe, expect, it } from "vitest";

async function setupTest(
  options: {
    skillOwnerRole?: "admin" | "builder" | "user";
    requestUserRole?: "admin" | "builder" | "user";
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
      skillOwnerRole: "builder",
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

  it("syncs nested skill references", async () => {
    const { workspace, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
    });

    const childSkill = await SkillFactory.create(requestUserAuth, {
      name: "Referenced Skill",
    });
    const instructionsWithReference =
      "Use the referenced skill for deeper analysis.";
    const buildBody = (
      instructions: string,
      referencedSkillIds?: string[]
    ) => ({
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions,
      icon: null,
      tools: [],
      attachedKnowledge: [],
      instructionsHtml: null,
      ...(referencedSkillIds !== undefined ? { referencedSkillIds } : {}),
    });

    const addResponse = await patchSkill(
      workspace,
      skill.sId,
      buildBody(instructionsWithReference, [childSkill.sId])
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

    const omittedResponse = await patchSkill(
      workspace,
      skill.sId,
      buildBody(instructionsWithReference)
    );
    expect(omittedResponse.status).toBe(200);
    const skillAfterOmittedReferences = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(skillAfterOmittedReferences).not.toBeNull();
    await expect(
      skillAfterOmittedReferences!.fetchChildSkills(requestUserAuth)
    ).resolves.toEqual([
      expect.objectContaining({
        sId: childSkill.sId,
      }),
    ]);

    const removeResponse = await patchSkill(
      workspace,
      skill.sId,
      buildBody("No nested skill references here.", [])
    );
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
      instructions: "Use the other workspace skill.",
      icon: null,
      tools: [],
      attachedKnowledge: [],
      referencedSkillIds: [outOfWorkspaceSkillId],
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
      referencedSkillIds: [childSkill.sId],
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
    await GroupSpaceFactory.associate(openSpace, globalGroup);

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

  it("should preserve existing additional requested spaces when omitted", async () => {
    const { workspace, skill, requestUserAuth, globalGroup } = await setupTest({
      requestUserRole: "admin",
    });

    const openSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(openSpace, globalGroup);

    await skill.updateSkill(requestUserAuth, {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      icon: skill.icon,
      instructions: skill.instructions,
      instructionsHtml: skill.instructionsHtml,
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
  it("should update file attachments when sandbox_tools is enabled", async () => {
    const { auth, workspace, skill, requestUser, requestUserAuth } =
      await setupTest({
        skillOwnerRole: "builder",
        requestUserRole: "builder",
      });

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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

  it("should succeed without file attachments when sandbox_tools is not enabled", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
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

  it("should succeed without file attachments", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "builder",
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
        skillOwnerRole: "builder",
        requestUserRole: "builder",
      });

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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
  it("should return 403 for non-editor user", async () => {
    const { workspace, skill } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "user",
    });

    const response = await deleteSkill(workspace, skill.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only editors can delete this skill.",
      },
    });
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
