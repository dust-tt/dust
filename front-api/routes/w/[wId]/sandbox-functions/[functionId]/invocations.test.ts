import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return {
    ...mod,
    publishSandboxFunctionInvocationEvent: vi.fn(),
  };
});

vi.mock("@app/temporal/agent_loop/client", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/temporal/agent_loop/client")>();
  return {
    ...mod,
    launchSandboxFunctionToolWorkflow: vi.fn(async () => new Ok(undefined)),
  };
});

vi.mock("@app/lib/actions/tool_status", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/actions/tool_status")>();
  return {
    ...mod,
    setUserAlwaysApprovedTool: vi.fn(),
  };
});

import { setUserAlwaysApprovedTool } from "@app/lib/actions/tool_status";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/agent_loop/client";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setupSandboxFunction({
  addCallerToSpace = true,
  withSandboxFunctionsFeatureFlag = true,
}: {
  addCallerToSpace?: boolean;
  withSandboxFunctionsFeatureFlag?: boolean;
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (withSandboxFunctionsFeatureFlag) {
    await FeatureFlagFactory.basic(adminAuth, "sandbox_functions");
  }

  const space = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(adminAuth, null, {
    contentType: sandboxFunctionContentType,
    fileName: "function.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(adminAuth, {
    space,
    file,
    slug: "run-function",
    description: "Run the function.",
    inputSchema,
    outputSchema,
  });

  const { user } = await createPrivateApiMockRequest({
    role: "user",
    workspace,
  });
  if (addCallerToSpace) {
    const addMemberResult = await space.groups[0].dangerouslyAddMember(
      adminAuth,
      {
        user: user.toJSON(),
      }
    );
    expect(addMemberResult.isOk()).toBe(true);
  }

  return { workspace, sandboxFunction, adminAuth, space };
}

// Builds a blocked action awaiting validation, the state spolu's creation gate produces for
// approval-requiring tools (created without a workflow launch).
async function setupBlockedAction({
  permission = "high",
}: {
  permission?: MCPToolStakeLevelType;
} = {}) {
  const { workspace, sandboxFunction, adminAuth, space } =
    await setupSandboxFunction();

  const { globalGroup, systemGroup } = await GroupFactory.defaults(workspace);
  await SpaceResource.makeDefaultsForWorkspace(adminAuth, {
    globalGroup,
    systemGroup,
  });
  const server = await InternalMCPServerInMemoryResource.makeNew(adminAuth, {
    name: "common_utilities",
    useCase: null,
  });
  const view = await MCPServerViewFactory.create(workspace, server.id, space);

  const invocation = await SandboxFunctionInvocationResource.makeNew(
    adminAuth,
    { sandboxFunction }
  );
  const action = await SandboxFunctionMCPActionFactory.create(adminAuth, {
    invocation,
    mcpServerView: view,
    permission,
  });
  const [blockedCount] = await action.updateStatusFromExpected(adminAuth, {
    status: "blocked_validation_required",
    expectedStatus: "running",
  });
  expect(blockedCount).toBe(1);

  return { workspace, sandboxFunction, invocation, action, view, adminAuth };
}

function postValidate({
  workspaceId,
  functionIdOrSlug,
  invocationId,
  actionId,
  body,
}: {
  workspaceId: string;
  functionIdOrSlug: string;
  invocationId: string;
  actionId: string;
  body: unknown;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${encodeURIComponent(functionIdOrSlug)}/invocations/${invocationId}/actions/${actionId}/validate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postInvocation({
  workspaceId,
  functionIdOrSlug,
  body = {},
}: {
  workspaceId: string;
  functionIdOrSlug: string;
  body?: unknown;
}) {
  const encodedFunctionIdOrSlug = encodeURIComponent(functionIdOrSlug);

  return honoApp.request(
    `/api/w/${workspaceId}/sandbox-functions/${encodedFunctionIdOrSlug}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations", () => {
  it("creates an invocation through the sandbox function resource", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    const createdAt = new Date().toISOString();
    const invokeSpy = vi
      .spyOn(SandboxFunctionResource.prototype, "invoke")
      .mockResolvedValue(
        new Ok({
          sId: "test-invocation-id",
          functionId: sandboxFunction.sId,
          status: "created",
          createdAt,
        })
      );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      body: {
        input: { message: "hello" },
        context: { frameFileId: sandboxFunction.file.sId },
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      invocation: {
        sId: "test-invocation-id",
        functionId: sandboxFunction.sId,
        status: "created",
        createdAt,
      },
    });
    expect(invokeSpy).toHaveBeenCalledWith(expect.anything(), {
      input: { message: "hello" },
      context: { frameFileId: sandboxFunction.file.sId },
    });
    expect(publishSandboxFunctionInvocationEvent).toHaveBeenCalledWith(
      {
        type: "sandbox_function_invocation_created",
        created: Date.parse(createdAt),
        invocation: {
          sId: "test-invocation-id",
          functionId: sandboxFunction.sId,
          status: "created",
          createdAt,
        },
      },
      { invocationId: "test-invocation-id" }
    );
  });

  it("creates an invocation by pod id and function slug", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    const createdAt = new Date().toISOString();
    const invokeSpy = vi
      .spyOn(SandboxFunctionResource.prototype, "invoke")
      .mockResolvedValue(
        new Ok({
          sId: "test-invocation-id",
          functionId: sandboxFunction.sId,
          status: "created",
          createdAt,
        })
      );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: `${sandboxFunction.space.sId}/${sandboxFunction.slug}`,
      body: {
        input: { message: "hello" },
      },
    });

    expect(response.status).toBe(201);
    expect(invokeSpy).toHaveBeenCalledWith(expect.anything(), {
      input: { message: "hello" },
    });
  });

  it("returns 404 when the user cannot access the function space", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      addCallerToSpace: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "sandbox_function_not_found" },
    });
  });

  it("does not require Computer access", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValue(
      new Ok({
        sId: "test-invocation-id",
        functionId: sandboxFunction.sId,
        status: "created",
        createdAt: new Date().toISOString(),
      })
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(201);
  });

  it("returns 500 when the resource invocation fails", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction();
    vi.spyOn(SandboxFunctionResource.prototype, "invoke").mockResolvedValue(
      new Err(new Error("sandbox failed"))
    );

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {
        type: "internal_server_error",
        message: "Sandbox function invocation failed.",
      },
    });
  });

  it("requires sandbox functions to be enabled", async () => {
    const { workspace, sandboxFunction } = await setupSandboxFunction({
      withSandboxFunctionsFeatureFlag: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "feature_flag_not_found",
        message: "Sandbox Functions are not enabled for this workspace.",
      },
    });
  });
});

describe("POST /api/w/:wId/sandbox-functions/:functionIdOrSlug/invocations/:invocationId/actions/:actionId/validate", () => {
  it("approves a blocked action and launches its workflow", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction();
    const removeEventSpy = vi
      .spyOn(getRedisHybridManager(), "removeEvent")
      .mockResolvedValue(undefined);

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    expect(refetched?.status).toBe("running");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledWith(
      expect.anything(),
      { action: expect.objectContaining({ sId: action.sId }) }
    );
    expect(removeEventSpy).toHaveBeenCalledWith(
      expect.any(Function),
      `sandbox-function-invocation-${invocation.sId}`
    );
  });

  it("rejects a blocked action without launching its workflow", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "rejected" },
    });

    expect(response.status).toBe(200);

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    // The poll endpoint surfaces `denied` as a 403 rejection to the in-sandbox caller.
    expect(refetched?.status).toBe("denied");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });

  it("marks the action errored when the workflow launch throws", async () => {
    const { workspace, sandboxFunction, invocation, action, adminAuth } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );
    vi.mocked(launchSandboxFunctionToolWorkflow).mockRejectedValueOnce(
      new Error("temporal unavailable")
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(500);

    // Compensated to a terminal status instead of hanging `running` with no workflow.
    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        adminAuth,
        action.id
      );
    expect(refetched?.status).toBe("errored");
  });

  it("records an always-approve for low-stake tools", async () => {
    const { workspace, sandboxFunction, invocation, action, view } =
      await setupBlockedAction({ permission: "low" });
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "always_approved" },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(setUserAlwaysApprovedTool)).toHaveBeenCalledWith(
      expect.anything(),
      {
        mcpServerId: view.mcpServerId,
        functionCallName: "math_operation",
      }
    );
  });

  it("returns action_not_blocked on a second validation", async () => {
    const { workspace, sandboxFunction, invocation, action } =
      await setupBlockedAction();
    vi.spyOn(getRedisHybridManager(), "removeEvent").mockResolvedValue(
      undefined
    );

    const first = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });
    expect(first.status).toBe(200);

    // The client treats this error type as an already-successful validation.
    const second = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({
      error: { type: "action_not_blocked" },
    });
  });

  it("scopes actions to the invocation in the path", async () => {
    const { workspace, sandboxFunction, action, adminAuth } =
      await setupBlockedAction();
    const otherInvocation = await SandboxFunctionInvocationResource.makeNew(
      adminAuth,
      { sandboxFunction }
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: otherInvocation.sId,
      actionId: action.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_found" },
    });
  });

  it("returns action_not_blocked for an action that is not awaiting validation", async () => {
    const { workspace, sandboxFunction, invocation, view, adminAuth } =
      await setupBlockedAction();
    const runningAction = await SandboxFunctionMCPActionFactory.create(
      adminAuth,
      { invocation, mcpServerView: view }
    );

    const response = await postValidate({
      workspaceId: workspace.sId,
      functionIdOrSlug: sandboxFunction.sId,
      invocationId: invocation.sId,
      actionId: runningAction.sId,
      body: { approved: "approved" },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "action_not_blocked" },
    });
  });
});
