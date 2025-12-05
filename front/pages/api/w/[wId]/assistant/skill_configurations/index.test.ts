import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

async function setupTest(method: RequestMethod = "POST") {
  const mockRequest = await createPrivateApiMockRequest({
    method,
    role: "admin",
  });

  await FeatureFlagFactory.basic("skills", mockRequest.workspace);

  return mockRequest;
}

describe("POST /api/w/[wId]/assistant/skill_configurations", () => {
  it("creates a simple skill configuration", async () => {
    const { req, res, workspace } = await setupTest();

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
    const { req, res, workspace, authenticator, user } = await setupTest();

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
