import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
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

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
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
