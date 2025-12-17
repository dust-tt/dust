import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types";
import type {
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";

import handler from "./index";

async function setupTest(
  method: RequestMethod = "GET",
  role: MembershipRoleType = "builder"
) {
  const mockRequest = await createPrivateApiMockRequest({
    method,
    role,
  });

  await FeatureFlagFactory.basic("skills", mockRequest.workspace);

  return mockRequest;
}

describe("GET /api/w/[wId]/skills", () => {
  it("should return 200 with skills", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillConfigurationFactory.create(auth, {
      name: "Test Skill 1",
      agentFacingDescription: "First test skill",
    });
    await SkillConfigurationFactory.create(auth, {
      name: "Test Skill 2",
      agentFacingDescription: "Second test skill",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("skillConfigurations");

    const skillNames = data.skillConfigurations.map((s: SkillType) => s.name);
    expect(skillNames).toContain("Test Skill 1");
    expect(skillNames).toContain("Test Skill 2");
  });

  it("should only return active skills", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillConfigurationFactory.create(auth, {
      name: "Active Skill",
      status: "active",
    });
    await SkillConfigurationFactory.create(auth, {
      name: "Archived Skill",
      status: "archived",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();

    const skillNames = data.skillConfigurations.map((s: SkillType) => s.name);
    expect(skillNames).toContain("Active Skill");
    expect(skillNames).not.toContain("Archived Skill");
  });

  it("should return 403 when user is not a builder", async () => {
    const { req, res, workspace } = await setupTest("GET", "user");

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("should return 403 when skills feature flag is not enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "app_auth_error",
        message: "Skills are not enabled for this workspace.",
      },
    });
  });

  it("should work for builder and admin roles", async () => {
    for (const role of ["builder", "admin"] as const) {
      const { req, res, workspace, user } = await setupTest("GET", role);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      await SkillConfigurationFactory.create(auth, {
        name: `Skill for ${role}`,
      });

      req.query = { ...req.query, wId: workspace.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const skillNames = res
        ._getJSONData()
        .skillConfigurations.map((s: SkillType) => s.name);
      expect(skillNames).toContain(`Skill for ${role}`);
    }
  });
});

describe("GET /api/w/[wId]/skills?withRelations=true", () => {
  it("should return skills with usage when linked to agents", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill With Usage",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillWithRelationsType) => s.sId === skillSId
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
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent With Frames",
    });

    await SkillConfigurationFactory.linkGlobalSkillToAgent(auth, {
      globalSkillId: "frames",
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillWithRelationsType) => s.sId === "frames"
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
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill Without Agents",
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillWithRelationsType) => s.sId === skillSId
      );

    expect(skillResult).toMatchObject({
      relations: {
        usage: {
          count: 0,
          agents: [],
        },
      },
    });
  });

  it("should return skills without usage when withRelations is not set", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill Without Relations",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find((s: SkillType) => s.sId === skillSId);

    expect(skillResult).toBeDefined();
    expect(skillResult).not.toHaveProperty("usage");
  });

  it("should return usage with multiple agents sorted by name", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Popular Skill",
    });

    const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent Alpha",
    });
    const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent Beta",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent1.id,
    });
    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent2.id,
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillWithRelationsType) => s.sId === skillSId
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

describe("POST /api/w/[wId]/skills", () => {
  it("creates a simple skill configuration", async () => {
    const { req, res, workspace } = await setupTest("POST", "admin");

    req.body = {
      name: "Simple Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A simple skill without tools",
      instructions: "Simple instructions",
      icon: null,
      tools: [],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.skillConfiguration).toMatchObject({
      name: "Simple Skill",
      agentFacingDescription: "To use in various situations",
      userFacingDescription: "A simple skill without tools",
      instructions: "Simple instructions",
      status: "active",
      tools: [],
    });

    // Verify skill was created in the database
    const skillConfiguration = await SkillConfigurationModel.findOne({
      where: {
        workspaceId: workspace.id,
        name: "Simple Skill",
      },
    });
    expect(skillConfiguration).not.toBeNull();
  });

  it("creates a skill configuration with 2 tools", async () => {
    const { req, res, workspace, authenticator, user, globalSpace } =
      await setupTest("POST", "admin");

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

    req.body = {
      name: "Test Skill",
      agentFacingDescription: "Use this skill all the time",
      userFacingDescription: "A test skill description",
      instructions: "Test instructions for the skill",
      icon: null,
      tools: [
        { mcpServerViewId: serverView1.sId },
        { mcpServerViewId: serverView2.sId },
      ],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.skillConfiguration).toMatchObject({
      name: "Test Skill",
      agentFacingDescription: "Use this skill all the time",
      userFacingDescription: "A test skill description",
      instructions: "Test instructions for the skill",
      status: "active",
      tools: [
        { mcpServerViewId: serverView1.sId },
        { mcpServerViewId: serverView2.sId },
      ],
    });

    // Verify skill was created in the database
    const skillConfiguration = await SkillConfigurationModel.findOne({
      where: {
        workspaceId: workspace.id,
        name: "Test Skill",
      },
    });
    expect(skillConfiguration).not.toBeNull();
    expect(skillConfiguration!.agentFacingDescription).toBe(
      "Use this skill all the time"
    );
    expect(skillConfiguration!.instructions).toBe(
      "Test instructions for the skill"
    );
    expect(skillConfiguration!.authorId).toBe(user.id);

    // Verify tools were created in the database
    const toolConfigurations = await SkillMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: skillConfiguration!.id,
      },
    });
    expect(toolConfigurations).toHaveLength(2);

    const serverViewIds = toolConfigurations.map((t) => t.mcpServerViewId);
    const view1 = await MCPServerViewResource.fetchById(
      authenticator,
      serverView1.sId
    );
    const view2 = await MCPServerViewResource.fetchById(
      authenticator,
      serverView2.sId
    );
    expect(serverViewIds).toContain(view1!.id);
    expect(serverViewIds).toContain(view2!.id);
  });

  it("creates a skill configuration with requestedSpaceIds derived from tool's space", async () => {
    const { req, res, workspace } = await setupTest("POST", "admin");

    // Create a regular space where the tool will be placed
    const regularSpace = await SpaceFactory.regular(workspace);

    // Create a remote MCP server and view in the regular space
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Server in Regular Space",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      regularSpace
    );

    req.body = {
      name: "Skill With Space Restrictions",
      agentFacingDescription: "A skill restricted to specific spaces",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [{ mcpServerViewId: serverView.sId }],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.skillConfiguration).toMatchObject({
      name: "Skill With Space Restrictions",
      requestedSpaceIds: [regularSpace.sId],
    });

    const skillConfiguration = await SkillConfigurationModel.findOne({
      where: {
        workspaceId: workspace.id,
        name: "Skill With Space Restrictions",
      },
    });
    expect(skillConfiguration).not.toBeNull();
    expect(skillConfiguration!.requestedSpaceIds).toEqual([
      String(regularSpace.id), // BigInt array returned as string
    ]);
  });
});

describe("Method Support /api/w/[wId]/skills", () => {
  it("should return 405 for unsupported methods", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const { req, res, workspace } = await setupTest(method);

      req.query = { ...req.query, wId: workspace.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toMatchObject({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
    }
  });
});
