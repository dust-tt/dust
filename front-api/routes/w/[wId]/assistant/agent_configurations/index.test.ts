import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

let testAgents: LightAgentConfigurationType[];

const TEST_MODEL = {
  providerId: "openai",
  modelId: "gpt-5-mini",
  temperature: 0.7,
};

/** Reasonable default parameters for test agents */
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

function listAgents(
  workspace: { sId: string },
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations${qs ? `?${qs}` : ""}`
  );
}

function postAgent(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations", () => {
  it("returns agent list configurations successfully should include all agents", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    const response = await listAgents(workspace, { view: "list" });

    expect(response.status).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      await response.json();
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(
      data.agentConfigurations.filter((a) => a.scope !== "global").length
    ).toBe(testAgents.length);
  });

  it("returns agent list configurations successfully - should not include other users' agents", async () => {
    const { workspace } = await createPrivateApiMockRequest({ method: "GET" });
    const { agentOwner } = await setupAgentOwner(workspace, "admin");
    await setupTestAgents(workspace, agentOwner);

    const response = await listAgents(workspace, { view: "list" });

    expect(response.status).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      await response.json();
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
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    const response = await listAgents(workspace, { view: "published" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(data.agentConfigurations.length).toBe(1);
  });

  it("returns agent configurations with feedback data", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    const response = await listAgents(workspace, { withFeedbacks: "true" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    // Check that feedback data is included
    expect(data.agentConfigurations[0].feedbacks).toBeDefined();
  });

  it("returns 400 for invalid query parameters", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });
    await setupTestAgents(workspace, user);

    const response = await listAgents(workspace, { limit: "invalid" });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns other users' hidden agents for an admin with the analytics view", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const { agentOwner } = await setupAgentOwner(workspace, "user");
    await setupTestAgents(workspace, agentOwner);

    const response = await listAgents(workspace, { view: "analytics" });

    expect(response.status).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      await response.json();
    expect(
      data.agentConfigurations
        .filter((a) => a.scope !== "global")
        .map((a) => a.scope)
        .sort()
    ).toEqual(["hidden", "visible"]);
  });

  it("returns agents from spaces the admin cannot read with the analytics view", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const { agentOwner, agentOwnerAuth } = await setupAgentOwner(
      workspace,
      "user"
    );

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersResult = await restrictedSpace.addMembers(adminAuth, {
      userIds: [agentOwner.sId],
    });
    expect(addMembersResult.isOk()).toBe(true);
    await agentOwnerAuth.refresh();

    const restrictedAgent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      {
        name: "Test Agent / Restricted space",
        scope: "hidden",
        requestedSpaceIds: [restrictedSpace.id],
      }
    );

    const response = await listAgents(workspace, { view: "analytics" });

    expect(response.status).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      await response.json();
    expect(data.agentConfigurations.map((a) => a.sId)).toContain(
      restrictedAgent.sId
    );
  });

  it("narrows the analytics view to non-private agents below the manager role", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const { agentOwner } = await setupAgentOwner(workspace, "user");
    await setupTestAgents(workspace, agentOwner);

    const response = await listAgents(workspace, { view: "analytics" });

    expect(response.status).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      await response.json();
    expect(
      data.agentConfigurations
        .filter((a) => a.scope !== "global")
        .map((a) => a.scope)
    ).toEqual(["visible"]);
  });

  it("lists unpublished and restricted space agents of other members in the manage_unrestricted view", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Both agents belong to another member: one is unpublished and the admin is not an editor,
    // the other requires a space the admin is not a member of.
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "builder");
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
      name: "Unpublished agent",
      scope: "hidden",
    });
    await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
      name: "Restricted space agent",
      scope: "visible",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const manageResponse = await listAgents(workspace, { view: "manage" });
    expect(manageResponse.status).toBe(200);
    const manageData: { agentConfigurations: LightAgentConfigurationType[] } =
      await manageResponse.json();
    const manageNames = manageData.agentConfigurations.map((a) => a.name);
    expect(manageNames).not.toContain("Unpublished agent");
    expect(manageNames).not.toContain("Restricted space agent");

    const response = await listAgents(workspace, {
      view: "manage_unrestricted",
    });
    expect(response.status).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      await response.json();
    const names = data.agentConfigurations.map((a) => a.name);
    expect(names).toContain("Unpublished agent");
    expect(names).toContain("Restricted space agent");
  });

  it("returns 403 for the manage_unrestricted view without admin role", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    const response = await listAgents(workspace, {
      view: "manage_unrestricted",
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("app_auth_error");
  });

  it("returns 404 for admin_internal view without super user", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    const response = await listAgents(workspace, { view: "admin_internal" });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("app_auth_error");
  });
});

describe("POST /api/w/:wId/assistant/agent_configurations - Skills with restricted spaces", () => {
  it("should include skill's requestedSpaceIds when creating agent with skill", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "POST",
    });

    await SpaceFactory.defaults(auth);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [user.sId] });
    await auth.refresh();

    const skill = await SkillFactory.create(auth, {
      name: "Skill with restricted space",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const skillResource = await SkillResource.fetchByModelIdWithAuth(
      auth,
      skill.id
    );
    expect(skillResource).not.toBeNull();

    const response = await postAgent(workspace, {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Skill",
        editors: [{ sId: user.sId }],
        skills: [{ sId: skillResource!.sId }],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.requestedSpaceIds).toContain(
      restrictedSpace.sId
    );
  });

  it("should add multiple skills when creating an agent", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "POST",
    });

    await SpaceFactory.defaults(auth);

    const customSkill = await SkillFactory.create(auth, {
      name: "Custom skill to add",
    });

    const response = await postAgent(workspace, {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Multiple Skills",
        editors: [{ sId: user.sId }],
        skills: [{ sId: customSkill.sId }, { sId: "frames" }],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const skills = await SkillResource.listByAgentConfiguration(
      auth,
      data.agentConfiguration
    );

    expect(skills.map((skill) => skill.sId).sort()).toEqual(
      [customSkill.sId, "frames"].sort()
    );
  });
});

describe("POST /api/w/:wId/assistant/agent_configurations - additionalRequestedSpaceIds", () => {
  it("should include additionalRequestedSpaceIds when creating agent", async () => {
    const { workspace, user, auth, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);

    const response = await postAgent(workspace, {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Additional Space",
        editors: [{ sId: user.sId }],
        // Additional space IDs to request not included by tool or skill.
        additionalRequestedSpaceIds: [openSpace.sId],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.requestedSpaceIds).toContain(openSpace.sId);

    // Verify the resource was correctly stored in the database
    const agentConfigurationModel = await AgentConfigurationModel.findOne({
      where: {
        workspaceId: workspace.id,
        sId: data.agentConfiguration.sId,
        version: data.agentConfiguration.version,
      },
    });
    expect(agentConfigurationModel).not.toBeNull();
    const openSpaceModelId = getResourceIdFromSId(openSpace.sId);
    expect(agentConfigurationModel?.requestedSpaceIds).toContain(
      openSpaceModelId
    );
  });

  it("should fail when user does not have access to additional space", async () => {
    // Use a regular user (not admin) who won't have access to all spaces
    const { workspace, user } = await createPrivateApiMockRequest({
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

    const response = await postAgent(workspace, {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Restricted Space",
        editors: [{ sId: user.sId }],
        // Use a restricted space that the user doesn't have access to
        additionalRequestedSpaceIds: [restrictedSpace.sId],
      },
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("assistant_saving_error");
    expect(data.error.message).toContain(
      `User does not have access to the following spaces: ${restrictedSpace.sId}`
    );
  });

  it("should deduplicate additionalRequestedSpaceIds that overlap with tool spaces", async () => {
    const { workspace, user, auth, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);
    const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);

    // Get the system view for the remote MCP server
    const systemMcpServerView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer.sId
      );
    expect(systemMcpServerView).not.toBeNull();

    const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
      systemView: systemMcpServerView!,
      space: openSpace,
    });

    const response = await postAgent(workspace, {
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
            dustProject: null,
          },
        ],
        editors: [{ sId: user.sId }],
        // Request the same space that the tool is in
        additionalRequestedSpaceIds: [openSpace.sId],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("agentConfiguration");
    // The space should appear only once (deduplicated)
    const actualRequestedSpaceIds = data.agentConfiguration.requestedSpaceIds;
    expect(actualRequestedSpaceIds).toHaveLength(1);
    expect(actualRequestedSpaceIds).toContain(openSpace.sId);
  });

  it("filters skills-only tools when saving an agent", async () => {
    const { workspace, user, auth, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);
    const remoteMCPServer = await RemoteMCPServerFactory.create(workspace);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        remoteMCPServer.sId
      );
    if (!systemView) {
      throw new Error("Expected system MCP server view.");
    }

    const { view: mcpServerView } = await MCPServerViewResource.create(auth, {
      systemView,
      space: openSpace,
    });
    const [updatedViewCount] = await MCPServerViewModel.update(
      { isRestrictedToSkills: true },
      { where: { id: mcpServerView.id } }
    );
    expect(updatedViewCount).toBe(1);

    const response = await postAgent(workspace, {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Test Agent with Skills-only Tool",
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
            dustProject: null,
          },
        ],
        editors: [{ sId: user.sId }],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfiguration.actions).toEqual([]);
    expect(data.agentConfiguration.requestedSpaceIds).not.toContain(
      openSpace.sId
    );
    const agentMCPServerConfigurationCount =
      await AgentMCPServerConfigurationModel.count({
        where: {
          workspaceId: workspace.id,
          agentConfigurationId: data.agentConfiguration.id,
        },
      });
    expect(agentMCPServerConfigurationCount).toBe(0);
  });
});

describe("GET /api/w/:wId/assistant/agent_configurations - instructionsHtml", () => {
  it("should not include instructionsHtml in light variant but should in full variant", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await SpaceFactory.defaults(auth);

    const testInstructionsHtml =
      '<p data-block-id="block1">Test instructions</p>';

    // Create an agent with instructionsHtml via POST.
    const response = await postAgent(workspace, {
      assistant: {
        ...TEST_AGENT_PARAMS,
        name: "Agent With HTML",
        instructionsHtml: testInstructionsHtml,
        editors: [{ sId: user.sId }],
      },
    });
    expect(response.status).toBe(200);
    const createdAgent = (await response.json()).agentConfiguration;

    // Light variant (via getAgentConfiguration) should nullify instructionsHtml.
    const lightAgent = await getAgentConfiguration(auth, {
      agentId: createdAgent.sId,
      variant: "light",
    });
    expect(lightAgent).not.toBeNull();
    // instructionsHtml is not part of LightAgentConfigurationType but we verify
    // the runtime value is null (not leaked from the DB).
    expect(lightAgent).toHaveProperty("instructionsHtml", null);

    // Full variant (via getAgentConfiguration) should include instructionsHtml.
    const fullAgent = await getAgentConfiguration(auth, {
      agentId: createdAgent.sId,
      variant: "full",
    });
    expect(fullAgent).not.toBeNull();
    expect(fullAgent!.instructionsHtml).toBe(testInstructionsHtml);
  });
});
