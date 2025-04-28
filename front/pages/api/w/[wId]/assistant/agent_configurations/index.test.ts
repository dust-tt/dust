import { LegalConsentOptionsLegitimateInterest } from "@hubspot/api-client/lib/codegen/marketing/forms";
import type { Transaction } from "sequelize";
import { describe, expect, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
  UserType,
} from "@app/types";

import handler from "./index";

let testAgents: LightAgentConfigurationType[];
let workspaceId: string;

// Mock Redis
vi.mock("@app/lib/api/redis", () => ({
  runOnRedis: vi
    .fn()
    .mockImplementation(
      async (opts: unknown, fn: (client: any) => Promise<unknown>) => {
        // Mock Redis client
        const mockRedisClient = {
          get: vi.fn(),
          set: vi.fn(),
          ttl: vi.fn(),
          zAdd: vi.fn(),
          expire: vi.fn(),
          zRange: vi.fn(),
          hGetAll: vi.fn().mockResolvedValue([]),
        };
        return fn(mockRedisClient);
      }
    ),
}));

async function setupAgentOwner(
  workspace: LightWorkspaceType,
  agentOwnerRole: "admin" | "builder" | "user"
) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, agentOwnerRole);
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );
  return { agentOwner, agentOwnerAuth };
}

async function setupTestAgents(
  workspace: LightWorkspaceType,
  user: UserResource,
  t: Transaction
) {
  workspaceId = workspace.sId;
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  // Create a few test agents with different configurations
  testAgents = await Promise.all([
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent / Workspace / ${user.name}`,
      description: "Workspace test agent",
      scope: "workspace",
    }),
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent / Published / ${user.name}`,
      description: "Published test agent",
      scope: "published",
    }),
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent / Private / ${user.name}`,
      description: "Private test agent",
      scope: "private",
    }),
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent / Hidden / ${user.name}`,
      description: "Hidden test agent",
      scope: "hidden",
    }),
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent / Visible / ${user.name}`,
      description: "Visible test agent",
      scope: "visible",
    }),
  ]);
}

describe("GET /api/w/[wId]/assistant/agent_configurations", () => {
  itInTransaction(
    "returns agent list configurations successfully should include all agents",
    async (t) => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
      });

      await setupTestAgents(workspace, user, t);
      req.query.view = "list";
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.agentConfigurations).toBeDefined();
      expect(Array.isArray(data.agentConfigurations)).toBe(true);
      expect(data.agentConfigurations.length).toBe(testAgents.length + 1);
    }
  );

  itInTransaction(
    "returns agent list configurations successfully - should not include other users' agents",
    async (t) => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
      });
      const { agentOwner } = await setupAgentOwner(workspace, "admin");
      await setupTestAgents(workspace, agentOwner, t);
      req.query.view = "list";
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.agentConfigurations).toBeDefined();
      expect(Array.isArray(data.agentConfigurations)).toBe(true);
      expect(data.agentConfigurations.length).toBe(testAgents.length + 1 - 2);
    }
  );

  itInTransaction(
    "returns workspace agent configurations successfully",
    async (t) => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
      });

      await setupTestAgents(workspace, user, t);
      req.query.view = "workspace";
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.agentConfigurations).toBeDefined();
      expect(Array.isArray(data.agentConfigurations)).toBe(true);
      expect(data.agentConfigurations.length).toBe(1);
    }
  );

  itInTransaction(
    "returns workspace agent configurations successfully",
    async (t) => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
      });

      await setupTestAgents(workspace, user, t);
      req.query.view = "workspace";
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.agentConfigurations).toBeDefined();
      expect(Array.isArray(data.agentConfigurations)).toBe(true);
      expect(data.agentConfigurations.length).toBe(1);
    }
  );

  itInTransaction(
    "returns agent configurations with feedback data",
    async (t) => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
      });

      await setupTestAgents(workspace, user, t);

      req.query.wId = workspaceId;
      req.query.withFeedbacks = "true";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.agentConfigurations).toBeDefined();
      expect(Array.isArray(data.agentConfigurations)).toBe(true);
      // Check that feedback data is included
      expect(data.agentConfigurations[0].feedbacks).toBeDefined();
    }
  );

  itInTransaction("returns 400 for invalid query parameters", async (t) => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
    });
    workspaceId = workspace.sId;
    await setupTestAgents(workspace, user, t);

    req.query.wId = workspaceId;
    req.query.limit = "invalid";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("invalid_request_error");
  });

  itInTransaction(
    "returns 404 for admin_internal view without super user",
    async (t) => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
      });

      await setupTestAgents(workspace, user, t);

      req.query.wId = workspaceId;
      req.query.view = "admin_internal";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const data = JSON.parse(res._getData());
      expect(data.error).toBeDefined();
      expect(data.error.type).toBe("app_auth_error");
    }
  );
});

describe("Method Support /api/w/[wId]/assistant/agent_configurations", () => {
  itInTransaction("only supports GET and POST methods", async () => {
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
