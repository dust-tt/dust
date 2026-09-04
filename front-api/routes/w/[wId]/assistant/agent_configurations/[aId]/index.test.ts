import {
  archiveAgentConfiguration,
  createPendingAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
  getAgentRecentAuthors: vi.fn().mockResolvedValue([]),
}));

function patch(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId - Skills with restricted spaces", () => {
  it("should include skill's requestedSpaceIds when updating agent with skill", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });
    await SpaceFactory.defaults(auth);

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [user.sId] });
    const skill = await SkillFactory.create(auth, {
      name: "Skill with restricted space",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await patch(workspace, agent.sId, {
      assistant: {
        name: agent.name,
        description: agent.description,
        instructions: "Updated instructions",
        pictureUrl: agent.pictureUrl,
        status: "active",
        scope: agent.scope,
        model: {
          providerId: agent.model.providerId,
          modelId: agent.model.modelId,
          temperature: agent.model.temperature,
        },
        actions: [],
        templateId: null,
        tags: [],
        editors: [{ sId: user.sId }],
        skills: [{ sId: skill.sId }],
        additionalRequestedSpaceIds: [],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.requestedSpaceIds).toContain(
      restrictedSpace.sId
    );
  });
});

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId - additionalRequestedSpaceIds", () => {
  it("should include additionalRequestedSpaceIds when updating agent", async () => {
    const { workspace, user, auth, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "PATCH",
      });

    await SpaceFactory.defaults(auth);

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const openSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(openSpace, globalGroup);

    const response = await patch(workspace, agent.sId, {
      assistant: {
        name: agent.name,
        description: agent.description,
        instructions: "Updated instructions",
        pictureUrl: agent.pictureUrl,
        status: "active",
        scope: agent.scope,
        model: {
          providerId: agent.model.providerId,
          modelId: agent.model.modelId,
          temperature: agent.model.temperature,
        },
        actions: [],
        templateId: null,
        tags: [],
        editors: [{ sId: user.sId }],
        skills: [],
        additionalRequestedSpaceIds: [openSpace.sId],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.requestedSpaceIds).toContain(openSpace.sId);

    const agentConfigurationModel = await AgentConfigurationModel.findOne({
      where: {
        sId: data.agentConfiguration.sId,
        version: data.agentConfiguration.version,
        workspaceId: workspace.id,
      },
    });
    expect(agentConfigurationModel).not.toBeNull();
    const openSpaceModelId = getResourceIdFromSId(openSpace.sId);
    expect(agentConfigurationModel?.requestedSpaceIds).toContain(
      openSpaceModelId
    );
  });
});

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId - non-editor admin", () => {
  it("cannot edit the instructions of an agent it is not an editor of", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });
    await SpaceFactory.defaults(auth);

    const { agentOwner, agentOwnerAuth } = await setupAgentOwner(
      workspace,
      "user"
    );
    const agent =
      await AgentConfigurationFactory.createTestAgent(agentOwnerAuth);

    const response = await patch(workspace, agent.sId, {
      assistant: {
        name: agent.name,
        description: agent.description,
        instructions: "Instructions rewritten by a non-editor admin",
        pictureUrl: agent.pictureUrl,
        status: "active",
        scope: agent.scope,
        model: {
          providerId: agent.model.providerId,
          modelId: agent.model.modelId,
          temperature: agent.model.temperature,
        },
        actions: [],
        templateId: null,
        tags: [],
        editors: [{ sId: agentOwner.sId }],
        skills: [],
        additionalRequestedSpaceIds: [],
      },
    });

    expect(response.status).toBe(403);

    const unchanged = await getAgentConfiguration(agentOwnerAuth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(unchanged?.instructions).toBe(agent.instructions);
  });
});

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId - archived agent", () => {
  it("rejects updates until the agent is restored", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await archiveAgentConfiguration(auth, agent.sId);

    const response = await patch(workspace, agent.sId, {
      assistant: {
        name: agent.name,
        description: agent.description,
        instructions: "Updated instructions",
        pictureUrl: agent.pictureUrl,
        status: "active",
        scope: agent.scope,
        model: {
          providerId: agent.model.providerId,
          modelId: agent.model.modelId,
          temperature: agent.model.temperature,
        },
        actions: [],
        templateId: null,
        tags: [],
        editors: [{ sId: user.sId }],
        skills: [],
        additionalRequestedSpaceIds: [],
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "An archived agent cannot be updated. Restore it first.",
      },
    });

    const versions = await AgentConfigurationModel.findAll({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(versions).toHaveLength(1);
  });
});

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId - pending agent", () => {
  it("should convert a pending agent to active with version 0", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });
    await SpaceFactory.defaults(auth);

    const pendingAgentRes = await createPendingAgentConfiguration(auth);
    if (pendingAgentRes.isErr()) {
      throw pendingAgentRes.error;
    }
    const { sId: pendingId } = pendingAgentRes.value;

    const response = await patch(workspace, pendingId, {
      assistant: {
        name: "My New Agent",
        description: "A test agent converted from pending",
        instructions: "Test instructions",
        pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
        status: "active",
        scope: "hidden",
        model: {
          providerId: "anthropic",
          modelId: "claude-sonnet-5",
          temperature: 0.5,
        },
        actions: [],
        templateId: null,
        tags: [],
        editors: [{ sId: user.sId }],
        skills: [],
        additionalRequestedSpaceIds: [],
      },
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("agentConfiguration");
    expect(data.agentConfiguration.sId).toBe(pendingId);
    expect(data.agentConfiguration.status).toBe("active");
    expect(data.agentConfiguration.name).toBe("My New Agent");
    expect(data.agentConfiguration.version).toBe(0);

    const agents = await AgentConfigurationModel.findAll({
      where: { sId: pendingId, workspaceId: workspace.id },
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe("active");
  });
});

function get(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}`,
    { method: "GET" }
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId - agents the caller cannot read", () => {
  it("redacts the private fields of an unpublished agent for a non-editor admin", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });
    await SpaceFactory.defaults(auth);

    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await get(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfiguration.sId).toBe(agent.sId);
    expect(data.agentConfiguration.name).toBe(agent.name);
    expect(data.agentConfiguration.canRead).toBe(false);
    expect(data.agentConfiguration.instructions).toBeNull();
    expect(data.agentConfiguration.instructionsHtml).toBeNull();
    expect(data.agentConfiguration.actions).toEqual([]);
    expect(data.agentConfiguration.skills).toEqual([]);
  });

  it("redacts the private fields of an agent built on a space the admin cannot read", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });
    await SpaceFactory.defaults(auth);

    const { agentOwner, agentOwnerAuth } = await setupAgentOwner(
      workspace,
      "user"
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(auth, { userIds: [agentOwner.sId] });
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "visible", requestedSpaceIds: [restrictedSpace.id] }
    );

    const response = await get(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfiguration.sId).toBe(agent.sId);
    expect(data.agentConfiguration.name).toBe(agent.name);
    expect(data.agentConfiguration.canRead).toBe(false);
    expect(data.agentConfiguration.instructions).toBeNull();
    expect(data.agentConfiguration.instructionsHtml).toBeNull();
    expect(data.agentConfiguration.actions).toEqual([]);
    expect(data.agentConfiguration.skills).toEqual([]);
  });

  it("keeps returning not found to a non-admin for an unpublished agent", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "GET",
    });
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(internalAdminAuth);

    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await get(workspace, agent.sId);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("agent_configuration_not_found");
  });

  it("keeps returning not found to a non-admin for an agent built on a space they cannot read", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "GET",
    });
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(internalAdminAuth);

    const { agentOwner, agentOwnerAuth } = await setupAgentOwner(
      workspace,
      "user"
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(internalAdminAuth, {
      userIds: [agentOwner.sId],
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "visible", requestedSpaceIds: [restrictedSpace.id] }
    );

    const response = await get(workspace, agent.sId);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("agent_configuration_not_found");
  });

  it("returns not found to an admin for an agent that does not exist", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });
    await SpaceFactory.defaults(auth);

    const response = await get(workspace, "does_not_exist");

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("agent_configuration_not_found");
  });

  it("returns the full agent to an admin who is one of its editors", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });
    await SpaceFactory.defaults(auth);

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      scope: "hidden",
    });

    const response = await get(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentConfiguration.sId).toBe(agent.sId);
    expect(data.agentConfiguration.instructions).toBe(agent.instructions);
  });
});
