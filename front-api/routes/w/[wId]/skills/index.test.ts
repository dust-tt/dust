import { Authenticator } from "@app/lib/auth";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

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

function postSkill(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/skills", () => {
  it.each([
    { length: 256, status: 200 },
    { length: 257, status: 400 },
  ])(
    "returns $status for a skill name of $length characters",
    async ({ length, status }) => {
      const { auth, workspace } = await setupTest("admin");
      const name = "a".repeat(length);

      const response = await postSkill(workspace, {
        name,
        agentFacingDescription: "Agent description",
        userFacingDescription: "User description",
        instructions: "Instructions",
        icon: "PuzzleIcon",
        tools: [],
        attachedKnowledge: [],
        instructionsHtml: null,
      });

      expect(response.status).toBe(status);
      const skill = await SkillResource.fetchByName(auth, name);
      if (status === 200) {
        expect(skill?.name).toBe(name);
      } else {
        expect(skill).toBeNull();
        const body = await response.json();
        expect(body.error.message).toContain("at most 256 characters");
      }
    }
  );

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
    const { auth, workspace, globalGroup, globalSpace } =
      await setupTest("admin");

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
      requestedSpaceIds: [openSpace.sId, globalSpace.sId],
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
    const { auth, workspace, user, globalSpace } = await setupTest("admin");

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
      requestedSpaceIds: [regularSpace.sId, globalSpace.sId],
    });

    const createdSkill = await SkillResource.fetchById(
      spaceMemberAuth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.requestedSpaceIds).toEqual([
      regularSpace.id,
      globalSpace.id,
    ]);
  });

  it("rejects tools from a space the user cannot read", async () => {
    const { auth, workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Server in Restricted Space",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      restrictedSpace
    );

    const name = "Skill With Restricted Tool";
    const response = await postSkill(workspace, {
      name,
      agentFacingDescription: "A skill with a tool from a restricted space",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [{ mcpServerViewId: serverView.sId }],
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "MCP server views not all found, 0 found, 1 requested",
      },
    });
    expect(await SkillResource.isNameTaken(auth, name)).toBe(false);
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
    const { auth, workspace, user, globalSpace } = await setupTest("admin");

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
      requestedSpaceIds: [regularSpace.sId, globalSpace.sId],
    });

    const createdSkill = await SkillResource.fetchById(
      spaceMemberAuth,
      responseData.skill.sId
    );
    expect(createdSkill).not.toBeNull();
    expect(createdSkill!.requestedSpaceIds).toEqual([
      regularSpace.id,
      globalSpace.id,
    ]);
  });

  it("rejects attached knowledge from a space the user cannot read", async () => {
    const { auth, workspace, user } = await setupTest("user");
    await grantCreateSkillCapability(workspace, user);

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      restrictedSpace,
      user
    );

    const nodeId = "node1";
    const title = "Document from restricted space";
    const name = "Skill With Restricted Knowledge";

    const response = await postSkill(workspace, {
      name,
      agentFacingDescription: "A skill with knowledge from a restricted space",
      userFacingDescription: "User description",
      instructions: `Read file: <knowledge id="${nodeId}" title="${title}" space="${restrictedSpace.sId}" dsv="${dataSourceView.sId}" hasChildren="false" />`,
      icon: "PuzzleIcon",
      tools: [],
      instructionsHtml: null,
      attachedKnowledge: [
        {
          dataSourceViewId: dataSourceView.sId,
          nodeId,
          nodeType: "document",
          spaceId: restrictedSpace.sId,
          title,
        },
      ],
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Data source views not all found, 0 found, 1 requested",
      },
    });
    expect(await SkillResource.isNameTaken(auth, name)).toBe(false);
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
