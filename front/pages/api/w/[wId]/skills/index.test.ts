import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import type { MembershipRoleType } from "@app/types";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

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
  it("should return 200 with empty array when no skills exist", async () => {
    const { req, res, workspace } = await setupTest();

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("skillConfigurations");
    expect(data.skillConfigurations).toBeInstanceOf(Array);
    expect(data.skillConfigurations).toHaveLength(0);
  });

  it("should return 200 with skills when skills exist", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillConfigurationFactory.create(auth, {
      name: "Test Skill 1",
      description: "First test skill",
    });
    await SkillConfigurationFactory.create(auth, {
      name: "Test Skill 2",
      description: "Second test skill",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skillConfigurations).toHaveLength(2);
    expect(data.skillConfigurations[0]).toHaveProperty("sId");
    expect(data.skillConfigurations[0]).toHaveProperty("name");
    expect(data.skillConfigurations[0]).toHaveProperty("description");

    const skillNames = data.skillConfigurations.map(
      (s: SkillConfigurationType) => s.name
    );
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
    expect(data.skillConfigurations).toHaveLength(1);
    expect(data.skillConfigurations[0].name).toBe("Active Skill");
  });

  it("should return 403 when user is not a builder", async () => {
    const { req, res, workspace } = await setupTest("GET", "user");

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error.type).toBe("app_auth_error");
    expect(data.error.message).toBe("User is not a builder.");
  });

  it("should return 403 when skills feature flag is not enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });
    // Don't create the feature flag

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error.type).toBe("app_auth_error");
    expect(data.error.message).toBe(
      "Skills are not enabled for this workspace."
    );
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
      const data = res._getJSONData();
      expect(data.skillConfigurations).toHaveLength(1);
      expect(data.skillConfigurations[0].name).toBe(`Skill for ${role}`);
    }
  });
});

describe("GET /api/w/[wId]/skills?withRelations=true", () => {
  it("should return skills with usage when withRelations=true", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill With Usage",
    });

    // Create an agent and link the skill to it
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skillConfigurations).toHaveLength(1);
    expect(data.skillConfigurations[0]).toHaveProperty("usage");
    expect(data.skillConfigurations[0].usage).toHaveProperty("count");
    expect(data.skillConfigurations[0].usage).toHaveProperty("agents");
    expect(data.skillConfigurations[0].usage.count).toBe(1);
    expect(data.skillConfigurations[0].usage.agents).toHaveLength(1);
    expect(data.skillConfigurations[0].usage.agents[0].sId).toBe(agent.sId);
  });

  it("should return empty usage when skill has no agents", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillConfigurationFactory.create(auth, {
      name: "Skill Without Agents",
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skillConfigurations).toHaveLength(1);
    expect(data.skillConfigurations[0].usage.count).toBe(0);
    expect(data.skillConfigurations[0].usage.agents).toHaveLength(0);
  });

  it("should return skills without usage when withRelations is not set", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await SkillConfigurationFactory.create(auth, {
      name: "Skill Without Relations",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.skillConfigurations).toHaveLength(1);
    expect(data.skillConfigurations[0]).not.toHaveProperty("usage");
  });

  it("should return skills with multiple agents in usage", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Popular Skill",
    });

    // Create multiple agents and link them to the skill
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
    const data = res._getJSONData();
    expect(data.skillConfigurations).toHaveLength(1);
    expect(data.skillConfigurations[0].usage.count).toBe(2);
    expect(data.skillConfigurations[0].usage.agents).toHaveLength(2);

    // Agents should be sorted by name
    const agentNames = data.skillConfigurations[0].usage.agents.map(
      (a: { name: string }) => a.name
    );
    expect(agentNames).toEqual(["Agent Alpha", "Agent Beta"]);
  });
});

describe("Method Support /api/w/[wId]/skills", () => {
  it("should return 405 for unsupported methods", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const { req, res, workspace } = await setupTest(method);

      req.query = { ...req.query, wId: workspace.sId };

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
