import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

import handler from "./index";

async function setupTest(
  method: RequestMethod = "GET",
  role: MembershipRoleType = "user"
) {
  const mockRequest = await createPrivateApiMockRequest({
    method,
    role,
  });

  await FeatureFlagFactory.basic("skills", mockRequest.workspace);

  return mockRequest;
}

describe("GET /api/w/[wId]/assistant/skill_configurations", () => {
  it("should return 200 with empty array when agent has no skills", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("skills");
    expect(data.skills).toBeInstanceOf(Array);
    expect(data.skills).toHaveLength(0);
  });

  it("should return 200 with skills when agent has skills", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    // Create skills and link them to the agent
    const skill1 = await SkillConfigurationFactory.create(auth, {
      name: "Test Skill 1",
      description: "First test skill",
    });
    const skill2 = await SkillConfigurationFactory.create(auth, {
      name: "Test Skill 2",
      description: "Second test skill",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill1.id,
      agentConfigurationId: agent.id,
    });
    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill2.id,
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skills).toHaveLength(2);
    expect(data.skills[0]).toHaveProperty("sId");
    expect(data.skills[0]).toHaveProperty("name");
    expect(data.skills[0]).toHaveProperty("description");

    const skillNames = data.skills.map((s: SkillConfigurationType) => s.name);
    expect(skillNames).toContain("Test Skill 1");
    expect(skillNames).toContain("Test Skill 2");
  });

  it("should return 404 when agent does not exist", async () => {
    const { req, res, workspace } = await setupTest();

    req.query = {
      ...req.query,
      wId: workspace.sId,
      aId: "non_existent_agent_sId",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const data = res._getJSONData();
    expect(data).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  });

  it("should return 400 for invalid agent configuration ID", async () => {
    const { req, res, workspace } = await setupTest();

    req.query = {
      ...req.query,
      wId: workspace.sId,
      aId: ["invalid", "array"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("should return empty array for global agents", async () => {
    const { req, res, workspace } = await setupTest();

    // Use a global agent sId format
    req.query = {
      ...req.query,
      wId: workspace.sId,
      aId: "dust",
    };

    await handler(req, res);

    // Global agents return empty skills array (not yet implemented)
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skills).toEqual([]);
  });

  it("should only return skills from the correct workspace", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create agent in workspace
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    // Create skill and link it to agent
    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Workspace Skill",
    });
    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skills).toHaveLength(1);
    expect(data.skills[0].name).toBe("Workspace Skill");
  });

  it("should work for different user roles (user, builder, admin)", async () => {
    for (const role of ["user", "builder", "admin"] as const) {
      const { req, res, workspace, user } = await setupTest("GET", role);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const agent = await AgentConfigurationFactory.createTestAgent(auth);
      const skill = await SkillConfigurationFactory.create(auth, {
        name: `Skill for ${role}`,
      });
      await SkillConfigurationFactory.linkToAgent(auth, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });

      req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.skills).toHaveLength(1);
      expect(data.skills[0].name).toBe(`Skill for ${role}`);
    }
  });

  it("should return 400 when aId query param is missing", async () => {
    const { req, res, workspace } = await setupTest("GET");

    req.query = { ...req.query, wId: workspace.sId };
    // aId is intentionally not set

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe("Invalid agent configuration ID.");
  });
});

describe("Method Support /api/w/[wId]/assistant/skill_configurations", () => {
  it("should return 405 for unsupported methods", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const { req, res, workspace, user } = await setupTest(method);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      const agent = await AgentConfigurationFactory.createTestAgent(auth);

      req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const data = res._getJSONData();
      expect(data).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  });
});
describe("POST /api/w/[wId]/assistant/skill_configurations", () => {
  it("creates a simple skill configuration", async () => {
    const { req, res, workspace } = await setupTest("POST", "admin");

    req.body = {
      name: "Simple Skill",
      description: "A simple skill without tools",
      instructions: "Simple instructions",
      scope: "private",
      tools: [],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.skillConfiguration).toMatchObject({
      name: "Simple Skill",
      description: "A simple skill without tools",
      instructions: "Simple instructions",
      scope: "private",
      status: "active",
      version: 0,
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
    expect(skillConfiguration!.scope).toBe("private");
  });

  it("creates a skill configuration with 2 tools", async () => {
    const { req, res, workspace, authenticator, user } = await setupTest(
      "POST",
      "admin"
    );

    // Create spaces (system space is required for MCP servers)
    await SpaceFactory.system(workspace);

    const globalSpace = await SpaceFactory.global(workspace);

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
      description: "A test skill description",
      instructions: "Test instructions for the skill",
      scope: "workspace",
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
      description: "A test skill description",
      instructions: "Test instructions for the skill",
      scope: "workspace",
      status: "active",
      version: 0,
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
    expect(skillConfiguration!.description).toBe("A test skill description");
    expect(skillConfiguration!.instructions).toBe(
      "Test instructions for the skill"
    );
    expect(skillConfiguration!.scope).toBe("workspace");
    expect(skillConfiguration!.status).toBe("active");
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
});
