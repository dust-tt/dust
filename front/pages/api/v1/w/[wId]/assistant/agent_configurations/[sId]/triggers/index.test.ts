import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import handler from "@app/pages/api/v1/w/[wId]/assistant/agent_configurations/[sId]/triggers/index";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

// Mock getSession to return null
vi.mock(import("../../../../../../../../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue(null),
  };
});

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/{wId}/assistant/agent_configurations/{sId}/triggers", () => {
  it("returns 200 and empty array when agent has no triggers", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    // Set up workspace with user and agent
    const user = await UserFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);
    await MembershipFactory.createMemberships({
      users: [user],
      workspace,
      role: "admin",
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(userAuth);

    req.query = { wId: workspace.sId, sId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      triggers: [],
    });
  });

  it("returns 200 and triggers for agent", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    // Set up workspace with user and agent
    const user = await UserFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);
    await MembershipFactory.createMemberships({
      users: [user],
      workspace,
      role: "admin",
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(userAuth);

    // Create a schedule trigger
    const triggerFactory = new TriggerFactory(workspace.id);
    const trigger = await triggerFactory.createScheduleTrigger({
      name: "Daily Report",
      agentConfigurationId: agent.sId,
      editorId: user.id,
      cron: "0 9 * * *",
      timezone: "Europe/Paris",
    });

    req.query = { wId: workspace.sId, sId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0]).toMatchObject({
      name: "Daily Report",
      agentConfigurationSId: agent.sId,
      kind: "schedule",
      status: "enabled",
      configuration: {
        cron: "0 9 * * *",
        timezone: "Europe/Paris",
      },
    });
    expect(data.triggers[0].editor).toMatchObject({
      fullName: expect.any(String),
    });
  });

  it("returns 404 when agent does not exist", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    req.query = { wId: workspace.sId, sId: "non-existent-agent" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  });

  it("returns 405 for non-GET methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res, workspace } = await createPublicApiMockRequest({
        method,
      });

      const user = await UserFactory.basic();
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      await SpaceFactory.defaults(auth);
      await MembershipFactory.createMemberships({
        users: [user],
        workspace,
        role: "admin",
      });

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      const agent = await AgentConfigurationFactory.createTestAgent(userAuth);

      req.query = { wId: workspace.sId, sId: agent.sId };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, only GET is expected.",
        },
      });
    }
  });

  it("only returns triggers for the requested agent", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    // Set up workspace with user and two agents
    const user = await UserFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);
    await MembershipFactory.createMemberships({
      users: [user],
      workspace,
      role: "admin",
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent1 = await AgentConfigurationFactory.createTestAgent(userAuth, {
      name: "Agent 1",
    });
    const agent2 = await AgentConfigurationFactory.createTestAgent(userAuth, {
      name: "Agent 2",
    });

    // Create triggers for both agents
    const triggerFactory = new TriggerFactory(workspace.id);
    await triggerFactory.createScheduleTrigger({
      name: "Trigger for Agent 1",
      agentConfigurationId: agent1.sId,
      editorId: user.id,
    });
    await triggerFactory.createScheduleTrigger({
      name: "Trigger for Agent 2",
      agentConfigurationId: agent2.sId,
      editorId: user.id,
    });

    req.query = { wId: workspace.sId, sId: agent1.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0].name).toBe("Trigger for Agent 1");
  });
});
