import type { RequestMethod } from "node-mocks-http";
import type { Transaction } from "sequelize";
import { describe, expect, it, vi } from "vitest";

import { updateAgentPermissions } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";
import type { UserType } from "@app/types";

import handler from "./editors";

// Mock this function
vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
}));

// Helper to create a test agent configuration
async function createTestAgent(
  auth: Authenticator,
  t?: Transaction,
  overrides: Partial<{
    name: string;
    description: string;
    scope: Exclude<LightAgentConfigurationType["scope"], "global">;
    model: {
      providerId: ModelProviderIdType;
      modelId: ModelIdType;
      temperature?: number;
    };
  }> = {}
): Promise<LightAgentConfigurationType> {
  const name = overrides.name ?? "Test Agent";
  const description = overrides.description ?? "Test Agent Description";
  const scope = overrides.scope ?? "workspace";
  const providerId = overrides.model?.providerId ?? "openai";
  const modelId = overrides.model?.modelId ?? "gpt-4-turbo";
  const temperature = overrides.model?.temperature ?? 0.7;
  const user = auth.user()?.toJSON();

  const result = await createAgentConfiguration(
    auth,
    {
      name,
      description,
      instructions: "Test Instructions",
      maxStepsPerRun: 5,
      visualizationEnabled: false,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId,
        modelId,
        temperature,
      },
      templateId: null,
      requestedGroupIds: [], // Let createAgentConfiguration handle group creation
      tags: [], // Added missing tags property
      editors: user ? [user] : [],
    },
    t
  );

  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}

async function setupTest(
  options: {
    agentOwnerRole?: "admin" | "builder" | "user";
    requestUserRole?: "admin" | "builder" | "user";
    method?: RequestMethod;
  } = {},
  t?: Transaction
) {
  const agentOwnerRole = options.agentOwnerRole ?? "admin";
  const requestUserRole = options.requestUserRole ?? "admin";
  const method = options.method ?? "GET";

  // Create workspace, requesting user and auth based on requestUserRole
  const {
    req,
    res,
    workspace,
    user: requestUser,
  } = await createPrivateApiMockRequest({
    role: requestUserRole,
    method: method,
  });
  let requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  // Create agent owner (might be the same as requestUser or different)
  let agentOwner: UserResource;
  let agentOwnerAuth: Authenticator;
  if (requestUserRole === agentOwnerRole) {
    // If roles match, assume owner is the request user for simplicity in most tests
    // Specific tests requiring distinct owner/requestor will need custom setup
    agentOwner = requestUser;
    agentOwnerAuth = requestUserAuth;
  } else {
    agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, agentOwnerRole);
    agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
  }

  // Create agent owned by agentOwner
  const agent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    t
  );

  // Regenerate the agentOwnerAuth who's now in the agent editors group.
  agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );
  requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  // Set up query parameters for the agent
  req.query = { ...req.query, wId: workspace.sId, aId: agent.sId };

  return {
    req,
    res,
    workspace,
    agentOwner,
    agent,
    requestUser, // This is the user making the request
    requestUserAuth,
    requestUserRole,
  };
}

describe("GET /api/w/[wId]/assistant/agent_configurations/[aId]/editors", () => {
  itInTransaction(
    "should return 200 and the editor list for admin",
    async (t) => {
      const { req, res, agentOwner } = await setupTest(
        {
          requestUserRole: "admin",
        },
        t
      );

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data).toHaveProperty("editors");
      expect(data.editors).toBeInstanceOf(Array);
      expect(data.editors).toHaveLength(1); // Agent owner is the default editor
      expect(data.editors[0].id).toBe(agentOwner.id);
    }
  );

  itInTransaction(
    "should return 200 and the editor list for editor",
    async (t) => {
      const { req, res, agentOwner } = await setupTest(
        {
          agentOwnerRole: "builder",
          requestUserRole: "builder",
        },
        t
      );

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.editors).toHaveLength(1);
      expect(data.editors[0].id).toBe(agentOwner.id);
    }
  );

  itInTransaction("should return 404 for non-existent agent", async (t) => {
    const { req, res } = await setupTest({}, t);
    req.query.aId = "non_existent_agent_sid";

    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  });
});

describe("PATCH /api/w/[wId]/assistant/agent_configurations/[aId]/editors", () => {
  it("admin should successfully add an editor", async () => {
    const { req, res, workspace, agentOwner } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, "builder");

    req.body = { addEditorIds: [newEditor.sId] };

    await handler(req, res);
    const data = res._getJSONData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.editors).toHaveLength(2);
    const editorIds = data.editors.map((e: UserType) => e.sId);
    expect(editorIds).toContain(agentOwner.sId);
    expect(editorIds).toContain(newEditor.sId);
  });

  it("admin should successfully remove an editor", async () => {
    const { req, res, workspace, agent, agentOwner } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    // Add another editor first
    const editorToRemove = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorToRemove, "builder");
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
    const updateRes = await updateAgentPermissions(agentOwnerAuth, {
      agent,
      usersToAdd: [editorToRemove.toJSON()],
      usersToRemove: [],
    });
    if (updateRes.isErr()) {
      throw updateRes.error;
    }

    // Now remove the agent owner (original editor)
    req.body = { removeEditorIds: [agentOwner.sId] };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(editorToRemove.sId);
  });

  it("editor should successfully add another editor", async () => {
    const { req, res, workspace, agentOwner } = await setupTest({
      agentOwnerRole: "builder", // Make agent owner a builder
      requestUserRole: "builder",
      method: "PATCH",
    });

    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, "user");

    req.body = { addEditorIds: [newEditor.sId] };

    await handler(req, res);
    const data = res._getJSONData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.editors).toHaveLength(2);
    const editorIds = data.editors.map((e: UserType) => e.sId);
    expect(editorIds).toContain(agentOwner.sId);
    expect(editorIds).toContain(newEditor.sId);
  });

  it("editor should successfully remove another editor", async () => {
    const { req, res, workspace, agent, agentOwner, requestUser } =
      await setupTest({
        agentOwnerRole: "builder", // Make agent owner a builder
        requestUserRole: "builder",
        method: "PATCH",
      });

    // Add another editor first
    const editorToRemove = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorToRemove, "admin");
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );

    const updateRes = await updateAgentPermissions(agentOwnerAuth, {
      agent,
      usersToAdd: [editorToRemove.toJSON()],
      usersToRemove: [],
    });
    if (updateRes.isErr()) {
      throw updateRes.error;
    }

    // Now remove the added editor
    req.body = { removeEditorIds: [editorToRemove.sId] };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(agentOwner.sId); // Only original editor remains
  });

  itInTransaction("should return 403 for non-editor user", async (t) => {
    const { req, res } = await setupTest(
      {
        requestUserRole: "user",
        method: "PATCH",
      },
      t
    );

    req.body = { addEditorIds: ["some_user_sid"] }; // Body doesn't matter, auth fails first

    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the agent or workspace admins can modify editors.",
      },
    });
  });

  it("should return 400 when adding existing editor", async () => {
    const { req, res, agentOwner } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    req.body = { addEditorIds: [agentOwner.sId] }; // Try to re-add owner

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Cannot add: user is already a member of the group",
      },
    });
  });

  it("should return 400 when removing non-editor", async () => {
    const { req, res, workspace } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    const nonEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonEditor, "user");

    req.body = { removeEditorIds: [nonEditor.sId] };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Cannot remove: user is not a member of the group",
      },
    });
  });

  itInTransaction(
    "should return 404 when adding non-existent user",
    async (t) => {
      const { req, res } = await setupTest(
        {
          requestUserRole: "admin",
          method: "PATCH",
        },
        t
      );

      req.body = { addEditorIds: ["user_not_exists_sid"] };

      await handler(req, res);
      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "user_not_found",
          message: "Some users were not found: user_not_exists_sid",
        },
      });
    }
  );

  itInTransaction(
    "should return 404 when removing non-existent user",
    async (t) => {
      const { req, res } = await setupTest(
        {
          requestUserRole: "admin",
          method: "PATCH",
        },
        t
      );

      req.body = { removeEditorIds: ["user_not_exists_sid"] };

      await handler(req, res);
      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "user_not_found",
          message: "Some users were not found: user_not_exists_sid",
        },
      });
    }
  );

  itInTransaction(
    "should return 400 for invalid request body (empty)",
    async (t) => {
      const { req, res } = await setupTest(
        {
          requestUserRole: "admin",
          method: "PATCH",
        },
        t
      );

      req.body = {};

      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
      expect(res._getJSONData().error.message).toContain(
        "Either addEditorIds or removeEditorIds must be provided"
      );
    }
  );

  itInTransaction(
    "should return 400 for invalid request body (empty arrays)",
    async (t) => {
      const { req, res } = await setupTest(
        {
          requestUserRole: "admin",
          method: "PATCH",
        },
        t
      );

      req.body = { addEditorIds: [], removeEditorIds: [] };

      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
      expect(res._getJSONData().error.message).toContain(
        "Either addEditorIds or removeEditorIds must be provided"
      );
    }
  );

  it("should successfully add and remove editors in same request", async () => {
    const { req, res, workspace, agentOwner } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    const editorToAdd = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorToAdd, "builder");

    // Remove owner, add new editor
    req.body = {
      addEditorIds: [editorToAdd.sId],
      removeEditorIds: [agentOwner.sId],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(editorToAdd.sId);
  });

  itInTransaction("should return 404 for non-existent agent", async (t) => {
    const { req, res } = await setupTest({ method: "PATCH" }, t);
    req.query.aId = "non_existent_agent_sid";
    req.body = { addEditorIds: ["any_user_sid"] }; // Need a valid body

    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  });
});

describe("Method Support /api/w/[wId]/assistant/agent_configurations/[aId]/editors", () => {
  itInTransaction("only supports GET and PATCH methods", async (t) => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const { req, res } = await setupTest({ method }, t);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
    }
  });
});
