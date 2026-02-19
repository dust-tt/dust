import { createPendingAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import handler from "./index";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
  getAgentRecentAuthors: vi.fn().mockResolvedValue([]),
}));

async function setupTest(method: RequestMethod = "PATCH") {
  const { req, res, workspace, user, authenticator } =
    await createPrivateApiMockRequest({
      role: "admin",
      method,
    });

  await SpaceFactory.defaults(authenticator);

  return {
    req,
    res,
    workspace,
    user,
    authenticator,
  };
}

describe("PATCH /api/w/[wId]/assistant/agent_configurations/[aId] - Skills with restricted spaces", () => {
  it("should include skill's requestedSpaceIds when updating agent with skill", async () => {
    const { req, res, workspace, user, authenticator } = await setupTest();

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(authenticator, { userIds: [user.sId] });
    const skill = await SkillFactory.create(authenticator, {
      name: "Skill with restricted space",
      requestedSpaceIds: [restrictedSpace.id],
    });

    req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };
    req.body = {
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

describe("PATCH /api/w/[wId]/assistant/agent_configurations/[aId] - additionalRequestedSpaceIds", () => {
  it("should include additionalRequestedSpaceIds when updating agent", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "PATCH",
      });

    await SpaceFactory.defaults(authenticator);

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    // Create an open space (with global group) that the user has access to
    const openSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(openSpace, globalGroup);

    req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };
    req.body = {
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

describe("PATCH /api/w/[wId]/assistant/agent_configurations/[aId] - pending agent", () => {
  it("should convert a pending agent to active with version 0", async () => {
    const { req, res, workspace, user, authenticator } = await setupTest();

    await SpaceFactory.defaults(authenticator);

    // Create a pending agent using the helper function
    const { sId: pendingSId } =
      await createPendingAgentConfiguration(authenticator);

    req.query = { ...req.query, wId: workspace.sId, aId: pendingSId };
    req.body = {
      assistant: {
        name: "My New Agent",
        description: "A test agent converted from pending",
        instructions: "Test instructions",
        pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
        status: "active",
        scope: "hidden",
        model: {
          providerId: "anthropic",
          modelId: "claude-sonnet-4-5-20250929",
          temperature: 0.5,
        },
        actions: [],
        templateId: null,
        tags: [],
        editors: [{ sId: user.sId }],
        skills: [],
        additionalRequestedSpaceIds: [],
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("agentConfiguration");
    // Verify the sId is preserved
    expect(data.agentConfiguration.sId).toBe(pendingSId);
    // Verify the status changed to active
    expect(data.agentConfiguration.status).toBe("active");
    // Verify the name was updated
    expect(data.agentConfiguration.name).toBe("My New Agent");
    // Verify version is 0 (not incremented since pending was deleted and new created)
    expect(data.agentConfiguration.version).toBe(0);

    // Verify only one record exists for this sId (pending was deleted)
    const agents = await AgentConfigurationModel.findAll({
      where: { sId: pendingSId, workspaceId: workspace.id },
    });
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe("active");
  });
});
