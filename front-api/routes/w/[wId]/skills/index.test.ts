import { Authenticator } from "@app/lib/auth";
import { SkillMCPServerConfigurationModel } from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { discoverToolsSkill } from "@app/lib/resources/skill/code_defined/discover_tools";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type {
  SkillWithoutInstructionsAndToolsType,
  SkillWithoutInstructionsAndToolsWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

async function setupTest(role: MembershipRoleType = "builder") {
  return createPrivateApiMockRequest({ role });
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

  it("should work for builder and admin roles", async () => {
    for (const role of ["builder", "admin"] as const) {
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

  it("should not return instructions or tools in skill list", async () => {
    const { workspace, auth, user } = await setupTest();

    const skill = await SkillFactory.create(auth, {
      name: "Picker Skill",
      userFacingDescription: "Shown in the capabilities picker",
    });

    const response = await getSkills(workspace);

    expect(response.status).toBe(200);

    const skillWithoutInstructionsAndTools = (
      await response.json()
    ).skills.find(
      (s: SkillWithoutInstructionsAndToolsType) => s.sId === skill.sId
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
      extendedSkillId: null,
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
});

describe("GET /api/w/:wId/skills?withRelations=true", () => {
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
        usage: { count: 0, agents: [] },
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
      extendedSkillId: null,
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

  it("creates a skill configuration with additional requested spaces", async () => {
    const { auth, workspace, globalGroup } = await setupTest("admin");

    const openSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(openSpace, globalGroup);

    const response = await postSkill(workspace, {
      name: "Skill With Additional Space",
      agentFacingDescription: "To use with an additional space",
      userFacingDescription: "A skill with a selected space",
      instructions: "Simple instructions",
      icon: "PuzzleIcon",
      tools: [],
      extendedSkillId: null,
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
    const { workspace } = await setupTest("builder");

    const restrictedSpace = await SpaceFactory.regular(workspace);

    const response = await postSkill(workspace, {
      name: "Skill With Restricted Additional Space",
      agentFacingDescription: "To use with a restricted space",
      userFacingDescription: "A skill with a selected space",
      instructions: "Simple instructions",
      icon: "PuzzleIcon",
      tools: [],
      extendedSkillId: null,
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
      extendedSkillId: null,
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
    const memberGroup = await GroupFactory.regular(
      workspace,
      "Tool Space Members"
    );
    await GroupFactory.withMembers(auth, memberGroup, [user]);
    await GroupSpaceFactory.associate(regularSpace, memberGroup);
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
      extendedSkillId: null,
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
      extendedSkillId: null,
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
    const memberGroup = await GroupFactory.regular(
      workspace,
      "Knowledge Space Members"
    );
    await GroupFactory.withMembers(auth, memberGroup, [user]);
    await GroupSpaceFactory.associate(regularSpace, memberGroup);
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
      extendedSkillId: null,
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
  it("creates a skill with file attachments when sandbox_tools is enabled", async () => {
    const { auth, workspace, user } = await setupTest("builder");

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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
      extendedSkillId: null,
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

  it("rejects file attachments when sandbox_tools is not enabled", async () => {
    const { auth, workspace, user } = await setupTest("admin");

    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 100,
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
      extendedSkillId: null,
      attachedKnowledge: [],
      instructionsHtml: null,
      fileAttachments: [{ fileId: file.sId }],
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain(
      "File attachments are not supported"
    );
  });

  it("succeeds without file attachments when sandbox_tools is not enabled", async () => {
    const { workspace } = await setupTest("admin");

    const response = await postSkill(workspace, {
      name: "Skill Without Files",
      agentFacingDescription: "A normal skill",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: "PuzzleIcon",
      tools: [],
      extendedSkillId: null,
      attachedKnowledge: [],
      instructionsHtml: null,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).skill.fileAttachments).toHaveLength(0);
  });

  it("rejects file attachments with wrong use case", async () => {
    const { auth, workspace, user } = await setupTest("admin");

    await FeatureFlagFactory.basic(auth, "sandbox_tools");

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
      extendedSkillId: null,
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
