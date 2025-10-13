import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

import handler from "./index";

let testAgents: LightAgentConfigurationType[];
let workspaceId: string;

export async function setupAgentOwner(
  workspace: LightWorkspaceType,
  agentOwnerRole: "admin" | "builder" | "user"
) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, {
    role: agentOwnerRole,
  });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );
  return { agentOwner, agentOwnerAuth };
}

async function setupTestAgents(
  workspace: LightWorkspaceType,
  user: UserResource
) {
  workspaceId = workspace.sId;
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  // Create a few test agents with different configurations
  testAgents = await Promise.all([
    AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent / Hidden / ${user.name}`,
      description: "Hidden test agent",
      scope: "hidden",
    }),
    AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent / Visible / ${user.name}`,
      description: "Visible test agent",
      scope: "visible",
    }),
  ]);
}

describe("GET /api/w/[wId]/assistant/agent_configurations", () => {
  it("returns agent list configurations successfully should include all agents", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);
    req.query.view = "list";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(
      data.agentConfigurations.filter((a) => a.scope !== "global").length
    ).toBe(testAgents.length);
  });

  it("returns agent list configurations successfully - should not include other users' agents", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const { agentOwner } = await setupAgentOwner(workspace, "admin");
    await setupTestAgents(workspace, agentOwner);
    req.query.view = "list";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data: { agentConfigurations: LightAgentConfigurationType[] } =
      JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(
      data.agentConfigurations.filter((a) => a.scope !== "global").length
    ).toBe(
      testAgents.filter((a) =>
        ["workspace", "published", "visible"].includes(a.scope)
      ).length
    );
  });

  it("returns workspace agent configurations successfully", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);
    req.query.view = "published";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    expect(data.agentConfigurations.length).toBe(1);
  });

  it("returns agent configurations with feedback data", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    req.query.wId = workspaceId;
    req.query.withFeedbacks = "true";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.agentConfigurations).toBeDefined();
    expect(Array.isArray(data.agentConfigurations)).toBe(true);
    // Check that feedback data is included
    expect(data.agentConfigurations[0].feedbacks).toBeDefined();
  });

  it("returns 400 for invalid query parameters", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });
    workspaceId = workspace.sId;
    await setupTestAgents(workspace, user);

    req.query.wId = workspaceId;
    req.query.limit = "invalid";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 404 for admin_internal view without super user", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });

    await setupTestAgents(workspace, user);

    req.query.wId = workspaceId;
    req.query.view = "admin_internal";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const data = JSON.parse(res._getData());
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("app_auth_error");
  });
});

describe("Method Support /api/w/[wId]/assistant/agent_configurations", () => {
  it("only supports GET and POST methods", async () => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET OR POST is expected.",
        },
      });
    }
  });
});
