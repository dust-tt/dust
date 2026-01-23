import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { MembershipRoleType } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

import handler from "./skills";

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

describe("GET /api/w/[wId]/assistant/agent_configurations/[aId]/skills", () => {
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
    const skill1 = await SkillFactory.create(auth, {
      name: "Test Skill 1",
      agentFacingDescription: "First test skill",
    });
    const skill2 = await SkillFactory.create(auth, {
      name: "Test Skill 2",
      agentFacingDescription: "Second test skill",
    });

    await SkillFactory.linkToAgent(auth, {
      skillId: skill1.id,
      agentConfigurationId: agent.id,
    });
    await SkillFactory.linkToAgent(auth, {
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
    expect(data.skills[0]).toHaveProperty("agentFacingDescription");

    const skillNames = data.skills.map((s: SkillType) => s.name);
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
    expect(data.error.message).toBe("Invalid agent configuration ID.");
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
    const skill = await SkillFactory.create(auth, {
      name: "Workspace Skill",
    });
    await SkillFactory.linkToAgent(auth, {
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

  it("should work for builder roles (builder, admin)", async () => {
    for (const role of ["builder", "admin"] as const) {
      const { req, res, workspace, user } = await setupTest("GET", role);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const agent = await AgentConfigurationFactory.createTestAgent(auth);
      const skill = await SkillFactory.create(auth, {
        name: `Skill for ${role}`,
      });
      await SkillFactory.linkToAgent(auth, {
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
});

describe("Method Support /api/w/[wId]/assistant/agent_configurations/[aId]/skills", () => {
  it("should return 405 for unsupported methods", async () => {
    for (const method of ["PUT", "PATCH", "DELETE", "POST"] as const) {
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
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  });
});
