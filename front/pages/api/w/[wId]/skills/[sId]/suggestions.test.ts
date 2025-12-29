import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import type { MembershipRoleType } from "@app/types";

import handler from "./suggestions";

async function setupTest(
  method: RequestMethod = "POST",
  role: MembershipRoleType = "builder"
) {
  const mockRequest = await createPrivateApiMockRequest({
    method,
    role,
  });

  await FeatureFlagFactory.basic("skills", mockRequest.workspace);

  return mockRequest;
}

describe("POST /api/w/[wId]/skills/[sId]/suggestions - Accept Suggestion", () => {
  it("should accept a suggested skill with one agent selected", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create a suggested skill
    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
    });

    // Create an agent and link it to the skill
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });

    req.query = { ...req.query, wId: workspace.sId, sId: skillSId };
    req.body = { agentSIds: [agent.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    // Verify skill status changed to active
    const updatedSkill = await SkillResource.fetchById(auth, skillSId);
    expect(updatedSkill?.status).toBe("active");

    // Verify agent-skill link still exists
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        customSkillId: skill.id,
        workspaceId: workspace.id,
      },
    });
    expect(agentSkills).toHaveLength(1);
    expect(agentSkills[0].agentConfigurationId).toBe(agent.id);
  });

  it("should accept a suggested skill with two agents and only keep one", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create a suggested skill
    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
    });

    // Create two agents and link both to the skill
    const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent 1",
    });
    const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent 2",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent1.id,
    });
    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent2.id,
    });

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });

    // Only select agent1
    req.query = { ...req.query, wId: workspace.sId, sId: skillSId };
    req.body = { agentSIds: [agent1.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });

    // Verify skill status changed to active
    const updatedSkill = await SkillResource.fetchById(auth, skillSId);
    expect(updatedSkill?.status).toBe("active");

    // Verify only agent1's link remains
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        customSkillId: skill.id,
        workspaceId: workspace.id,
      },
    });
    expect(agentSkills).toHaveLength(1);
    expect(agentSkills[0].agentConfigurationId).toBe(agent1.id);
  });

  it("should return 403 when user does not have write permissions", async () => {
    const { req, res, workspace, user } = await setupTest("POST", "user");

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create a suggested skill (by a different user)
    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
    });

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });

    req.query = { ...req.query, wId: workspace.sId, sId: skillSId };
    req.body = { agentSIds: [] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("should return 400 when skill is not in suggested status", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create an active skill (not suggested)
    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Active Skill",
      status: "active",
    });

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });

    req.query = { ...req.query, wId: workspace.sId, sId: skillSId };
    req.body = { agentSIds: [] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "invalid_request_error",
        message: "Only suggested skills can be accepted.",
      },
    });
  });

  it("should return 404 when skill does not exist", async () => {
    const { req, res, workspace } = await setupTest();

    req.query = {
      ...req.query,
      wId: workspace.sId,
      sId: "non_existent_skill_id",
    };
    req.body = { agentSIds: [] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toMatchObject({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });

  it("should accept with empty agentSIds and remove all agent links", async () => {
    const { req, res, workspace, user } = await setupTest();

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create a suggested skill
    const skill = await SkillConfigurationFactory.create(auth, {
      name: "Suggested Skill",
      status: "suggested",
    });

    // Create an agent and link it to the skill
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });

    await SkillConfigurationFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });

    const skillSId = SkillResource.modelIdToSId({
      id: skill.id,
      workspaceId: workspace.id,
    });

    // Accept with no agents selected
    req.query = { ...req.query, wId: workspace.sId, sId: skillSId };
    req.body = { agentSIds: [] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Verify skill status changed to active
    const updatedSkill = await SkillResource.fetchById(auth, skillSId);
    expect(updatedSkill?.status).toBe("active");

    // Verify all agent-skill links were removed
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        customSkillId: skill.id,
        workspaceId: workspace.id,
      },
    });
    expect(agentSkills).toHaveLength(0);
  });
});

describe("Method Support /api/w/[wId]/skills/[sId]/suggestions", () => {
  it("should return 405 for unsupported methods", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
      const { req, res, workspace, user } = await setupTest(method);

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const skill = await SkillConfigurationFactory.create(auth, {
        name: "Test Skill",
        status: "suggested",
      });

      const skillSId = SkillResource.modelIdToSId({
        id: skill.id,
        workspaceId: workspace.id,
      });

      req.query = { ...req.query, wId: workspace.sId, sId: skillSId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toMatchObject({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});
