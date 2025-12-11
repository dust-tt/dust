import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill/skill_configuration_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import type { MembershipRoleType } from "@app/types";
import type {
  SkillConfigurationRelations,
  SkillConfigurationType,
} from "@app/types/assistant/skill_configuration";

import handler from "./index";

type SkillConfigurationWithRelations = SkillConfigurationType &
  SkillConfigurationRelations;

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
  it("should return 200 with skills", async () => {
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
    expect(data).toHaveProperty("skillConfigurations");

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

    const skillNames = data.skillConfigurations.map(
      (s: SkillConfigurationType) => s.name
    );
    expect(skillNames).toContain("Active Skill");
    expect(skillNames).not.toContain("Archived Skill");
  });

  it("should return 403 when user is not a builder", async () => {
    const { req, res, workspace } = await setupTest("GET", "user");

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("should return 403 when skills feature flag is not enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "app_auth_error",
        message: "Skills are not enabled for this workspace.",
      },
    });
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
      const skillNames = res
        ._getJSONData()
        .skillConfigurations.map((s: SkillConfigurationType) => s.name);
      expect(skillNames).toContain(`Skill for ${role}`);
    }
  });
});

describe("GET /api/w/[wId]/skills?withRelations=true", () => {
  it("should return skills with usage when linked to agents", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill With Usage",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillConfigurationResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillConfigurationWithRelations) => s.sId === skillSId
      );

    expect(skillResult).toMatchObject({
      usage: {
        count: 1,
        agents: [{ sId: agent.sId }],
      },
    });
  });

  it("should return usage for skills linked via linkGlobalSkillToAgent", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent With Frames",
    });

    await SkillConfigurationFactory.linkGlobalSkillToAgent(auth, {
      globalSkillId: "frames",
      agentConfigurationId: agent.id,
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillConfigurationWithRelations) => s.sId === "frames"
      );

    expect(skillResult).toMatchObject({
      usage: {
        count: 1,
        agents: [{ sId: agent.sId }],
      },
    });
  });

  it("should return empty usage when skill has no agents", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill Without Agents",
    });

    req.query = { ...req.query, wId: workspace.sId, withRelations: "true" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillConfigurationResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillConfigurationWithRelations) => s.sId === skillSId
      );

    expect(skillResult).toMatchObject({
      usage: {
        count: 0,
        agents: [],
      },
    });
  });

  it("should return skills without usage when withRelations is not set", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Skill Without Relations",
    });

    req.query = { ...req.query, wId: workspace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const skillSId = SkillConfigurationResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillConfigurationType) => s.sId === skillSId
      );

    expect(skillResult).toBeDefined();
    expect(skillResult).not.toHaveProperty("usage");
  });

  it("should return usage with multiple agents sorted by name", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Popular Skill",
    });

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

    const skillSId = SkillConfigurationResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });
    const skillResult = res
      ._getJSONData()
      .skillConfigurations.find(
        (s: SkillConfigurationWithRelations) => s.sId === skillSId
      );

    expect(skillResult).toMatchObject({
      usage: {
        count: 2,
        agents: [{ name: "Agent Alpha" }, { name: "Agent Beta" }],
      },
    });
  });
});

describe("Method Support /api/w/[wId]/skills", () => {
  it("should return 405 for unsupported methods", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const { req, res, workspace } = await setupTest(method);

      req.query = { ...req.query, wId: workspace.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toMatchObject({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  });
});
