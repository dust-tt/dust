import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

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

    // Enable skills feature flag
    await FeatureFlagFactory.basic("skills", workspace);

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(authenticator, { userIds: [user.sId] });
    const skill = await SkillFactory.create(authenticator, {
      name: "Skill with restricted space",
    });

    await SkillConfigurationModel.update(
      { requestedSpaceIds: [restrictedSpace.id] },
      { where: { id: skill.id } }
    );

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
      openSpaceModelId?.toString()
    );
  });
});
