import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import handler from "@app/pages/api/v1/w/[wId]/triggers/index";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
} from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

// Mock getSession to return null
vi.mock(import("../../../../../lib/auth"), async (importOriginal) => {
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

describe("GET /api/v1/w/{wId}/triggers", () => {
  it("returns 200 and empty array when workspace has no triggers", async () => {
    const { req, res } = await createPublicApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      triggers: [],
    });
  });

  it("returns 200 and all triggers in workspace", async () => {
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

    // Create triggers
    const triggerFactory = new TriggerFactory(workspace.id);
    await triggerFactory.createScheduleTrigger({
      name: "Daily Report",
      agentConfigurationId: agent.sId,
      editorId: user.id,
    });
    await triggerFactory.createScheduleTrigger({
      name: "Weekly Summary",
      agentConfigurationId: agent.sId,
      editorId: user.id,
      cron: "0 9 * * 1",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.triggers).toHaveLength(2);
  });

  it("filters triggers by kind", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

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

    // Create schedule trigger
    const triggerFactory = new TriggerFactory(workspace.id);
    await triggerFactory.createScheduleTrigger({
      name: "Schedule Trigger",
      agentConfigurationId: agent.sId,
      editorId: user.id,
    });

    req.query = { wId: workspace.sId, kind: "schedule" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0].kind).toBe("schedule");
  });

  it("filters triggers by status", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

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

    const triggerFactory = new TriggerFactory(workspace.id);
    await triggerFactory.createScheduleTrigger({
      name: "Enabled Trigger",
      agentConfigurationId: agent.sId,
      editorId: user.id,
      status: "enabled",
    });
    await triggerFactory.createScheduleTrigger({
      name: "Disabled Trigger",
      agentConfigurationId: agent.sId,
      editorId: user.id,
      status: "disabled",
    });

    req.query = { wId: workspace.sId, status: "enabled" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0].status).toBe("enabled");
    expect(data.triggers[0].name).toBe("Enabled Trigger");
  });

  it("filters triggers by agentConfigurationSId", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

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

    req.query = { wId: workspace.sId, agentConfigurationSId: agent1.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0].name).toBe("Trigger for Agent 1");
    expect(data.triggers[0].agentConfigurationSId).toBe(agent1.sId);
  });

  it("returns 400 for invalid kind parameter", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    req.query = { wId: workspace.sId, kind: "invalid" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid kind parameter. Must be one of: schedule, webhook",
      },
    });
  });

  it("returns 400 for invalid status parameter", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest();

    req.query = { wId: workspace.sId, status: "invalid" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Invalid status parameter. Must be one of: enabled, disabled, relocating, downgraded",
      },
    });
  });

  it("returns 405 for non-GET methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res, workspace } = await createPublicApiMockRequest({
        method,
      });

      req.query = { wId: workspace.sId };

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
});
