import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

import handler from "./index";

let testAgents: LightAgentConfigurationType[];
let workspaceId: string;

const TEST_MODEL = {
  providerId: "openai",
  modelId: "gpt-4-turbo",
  temperature: 0.7,
};

/** Reasonnable default parameters for test agents */

const TEST_AGENT_PARAMS = {
  name: "Test Agent",
  description: "Test Agent Description",
  instructions: "Test instructions",
  pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
  status: "active",
  scope: "visible",
  model: TEST_MODEL,
  actions: [],
  templateId: null,
  tags: [],
  skills: [],
  additionalRequestedSpaceIds: [],
};

export async function setupAgentOwner(
  workspace: LightWorkspaceType,
  agentOwnerRole: "admin" | "builder" | "user"
) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, {
    role: agentOwnerRole,
  });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );
  return { agentOwner, agentOwnerAuth };
}

async function setupTestAgents(
  workspace: LightWorkspaceType,
  user: UserResource
) {
  workspaceId = workspace.sId;
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  // Create a few test agents with different configurations
  testAgents = await Promise.all([
    AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent / Hidden / ${user.name}`,
      description: "Hidden test agent",
      scope: "hidden",
    }),
    AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent / Visible / ${user.name}`,
      description: "Visible test agent",
      scope: "visible",
    }),
  ]);
}

describe("GET /api/w/[wId]/assistant/agent_configurations", () => {
  it("returns agent list configurations successfully should include all agents", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);
    req.query.view = "list";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(
      data.agentConfigurations.filter((a) => a.scope !== "global").length
    ).toBe(testAgents.length);
  });

  it("returns agent list configurations successfully - should not include other users' agents", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const { agentOwner } = await setupAgentOwner(workspace, "admin");
    await setupTestAgents(workspace, agentOwner);
    req.query.view = "list";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(
      data.agentConfigurations.filter((a) => a.scope !== "global").length
    ).toBe(
      testAgents.filter((a) =>
        ["workspace", "published", "visible"].includes(a.scope)
      ).length
    );
  });

  it("returns workspace agent configurations successfully", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);
    req.query.view = "published";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(data.agentConfigurations.length).toBe(1);
  });

  it("returns agent configurations with feedback data", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    req.query.wId = workspaceId;
    req.query.withFeedbacks = "true";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    // Check that feedback data is included
    expect(data.agentConfigurations[0].feedbacks).toBeDefined();
  });

  it("returns 400 for invalid query parameters", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });
    workspaceId = workspace.sId;
    await setupTestAgents(workspace, user);

    req.query.wId = workspaceId;
    req.query.limit = "invalid";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 404 for admin_internal view without super user", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    req.query.wId = workspaceId;
    req.query.view = "admin_internal";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const data = JSON.parse(res._getData());
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("app_auth_error");
  });
});

describe("Method Support /api/w/[wId]/assistant/agent_configurations", () => {
  it("only supports GET and POST methods", async () => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET OR POST is expected.",
        },
      });
    }
  });
});

describe("POST /api/w/[wId]/assistant/agent_configurations - Skills with restricted spaces", () => {
  it("should include skill's requestedSpaceIds when creating agent with skill", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    // Enable skills feature flag
    await FeatureFlagFactory.basic("skills", workspace);

    await SpaceFactory.defaults(authenticator);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const skill = await SkillConfigurationFactory.create(authenticator, {
      name: "Skill with restricted space",
    });
    await SkillConfigurationModel.update(
      { requestedSpaceIds: [restrictedSpace.id] },
      { where: { id: skill.id } }
    );

    const skillResource = await SkillResource.fetchByModelIdWithAuth(
      authenticator,
      skill.id
    );
    expect(skillResource).not.toBeNull();

    req.body = {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Skill",
        editors: [{ sId: user.sId }],
        skills: [{ sId: skillResource!.sId }],
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.requestedSpaceIds).toContain(
      restrictedSpace.sId
    );
  });
});

describe("POST /api/w/[wId]/assistant/agent_configurations - additionalRequestedSpaceIds", () => {
  it("should include additionalRequestedSpaceIds when creating agent", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    const openSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(openSpace, globalGroup);

    req.body = {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Additional Space",
        editors: [{ sId: user.sId }],
        // Additional space IDs to request not included by tool or skill.
        additionalRequestedSpaceIds: [openSpace.sId],
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.requestedSpaceIds).toContain(openSpace.sId);

    // Verify the resource was correctly stored in the database
    const agentConfigurationModel = await AgentConfigurationModel.findOne({
      where: {
        sId: data.agentConfiguration.sId,
        version: data.agentConfiguration.version,
      },
    });
    expect(agentConfigurationModel).not.toBeNull();
    const openSpaceModelId = getResourceIdFromSId(openSpace.sId);
    expect(agentConfigurationModel?.requestedSpaceIds).toContain(
      openSpaceModelId?.toString()
    );
  });

  it("should fail when user does not have access to additional space", async () => {
    // Use a regular user (not admin) who won't have access to all spaces
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
      method: "POST",
    });

    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(internalAdminAuth);

    // Create a restricted space without adding the global group
    // Regular users won't have access to this space
    const restrictedSpace = await SpaceFactory.regular(workspace);

    req.body = {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Restricted Space",
        editors: [{ sId: user.sId }],
        // Use a restricted space that the user doesn't have access to
        additionalRequestedSpaceIds: [restrictedSpace.sId],
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error.type).toBe("assistant_saving_error");
    expect(data.error.message).toContain(
      `User does not have access to the following spaces: ${restrictedSpace.sId}`
    );
  });

  it("should deduplicate additionalRequestedSpaceIds that overlap with tool spaces", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    const openSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(openSpace, globalGroup);
    const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);

    // Get the system view for the remote MCP server
    const systemMcpServerView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        remoteMCPServer.sId
      );
    expect(systemMcpServerView).not.toBeNull();

    const mcpServerView = await MCPServerViewResource.create(authenticator, {
      systemView: systemMcpServerView!,
      space: openSpace,
    });

    req.body = {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Overlapping Space",
        actions: [
          {
            type: "mcp_server_configuration",
            mcpServerViewId: mcpServerView.sId,
            name: "search",
            description: "Search data",
            dataSources: null,
            tables: null,
            childAgentId: null,
            timeFrame: null,
            jsonSchema: null,
            additionalConfiguration: {},
            dustAppConfiguration: null,
            secretName: null,
          },
        ],
        editors: [{ sId: user.sId }],
        // Request the same space that the tool is in
        additionalRequestedSpaceIds: [openSpace.sId],
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("agentConfiguration");
    // The space should appear only once (deduplicated)
    const actualRequestedSpaceIds = data.agentConfiguration.requestedSpaceIds;
    expect(actualRequestedSpaceIds).toHaveLength(1);
    expect(actualRequestedSpaceIds).toContain(openSpace.sId);
  });
});
