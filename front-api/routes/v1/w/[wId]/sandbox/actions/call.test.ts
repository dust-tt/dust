import { generateSandboxFunctionInvocationToken } from "@app/lib/api/sandbox/access_tokens";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import {
  createPersistedFrameFunctionInvocationTokenTestContext,
  createPersistedSandboxFunctionInvocationTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return {
    ...actual,
    publishSandboxFunctionInvocationEvent: vi.fn(),
  };
});

vi.mock("@app/temporal/sandbox_functions/client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/temporal/sandbox_functions/client")
    >();
  return {
    ...actual,
    launchSandboxFunctionToolWorkflow: vi.fn(async () => new Ok(undefined)),
  };
});

import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/sandbox_functions/client";

function callSandboxTool(
  workspace: { sId: string },
  token: string,
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/sandbox/actions/call`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function setupWithView({ noTools = false }: { noTools?: boolean } = {}) {
  const context =
    await createPersistedSandboxFunctionInvocationTokenTestContext({ noTools });
  const commonUtilities = await InternalMCPServerInMemoryResource.makeNew(
    context.auth,
    { name: "common_utilities", useCase: null }
  );
  const view = await MCPServerViewFactory.create(
    context.workspace,
    commonUtilities.id,
    context.globalSpace
  );
  return { ...context, view };
}

async function setupFrameWithView({
  noTools = false,
}: {
  noTools?: boolean;
} = {}) {
  const context = await createPersistedFrameFunctionInvocationTokenTestContext({
    noTools,
  });
  const commonUtilities = await InternalMCPServerInMemoryResource.makeNew(
    context.auth,
    { name: "common_utilities", useCase: null }
  );
  const view = await MCPServerViewFactory.create(
    context.workspace,
    commonUtilities.id,
    context.runtimeSpace
  );
  return { ...context, view };
}

describe("POST /api/v1/w/[wId]/sandbox/actions/call (function invocation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a running action and launches its workflow", async () => {
    const { auth, token, workspace, invocation, view } = await setupWithView();

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("pending");
    expect(body.actionId).toMatch(/^sfa_/);

    const action = await SandboxFunctionMCPActionResource.fetchById(
      auth,
      body.actionId
    );
    expect(action).not.toBeNull();
    expect(action?.status).toBe("running");
    expect(action?.toolName).toBe("generate_random_number");
    expect(action?.inputs).toEqual({ max: 10 });
    expect(action?.sandboxFunctionInvocationId).toBe(invocation.id);
    expect(action?.toolConfiguration.permission).toBe("never_ask");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledWith(
      expect.anything(),
      { action: expect.objectContaining({ sId: action?.sId }) }
    );
    expect(
      vi.mocked(publishSandboxFunctionInvocationEvent)
    ).not.toHaveBeenCalled();
  });

  it("refuses a tool call from a function published as fast", async () => {
    const { token, workspace, view } = await setupWithView({ noTools: true });

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe("fast_function_called_tools");
    // Prod frames string-match this phrase to classify the refusal; keep it stable.
    expect(body.error.message).toContain("published as fast");
    // Self-heal has already recorded the function as durable by the time the refusal is built,
    // so the copy must steer the caller to a retry, not a republish.
    expect(body.error.message).toContain("retrying the invocation will work");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
  });

  // The refusal is the only evidence that the published mode is wrong, so it is also what fixes
  // it: this invocation still fails, the next one runs durably.
  it("records the function as durable after refusing its tool call", async () => {
    const { auth, token, workspace, view, sandboxFunction } =
      await setupWithView({ noTools: true });
    expect(sandboxFunction.executionMode).toBe("fast");

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });
    expect(response.status).toBe(403);

    // The write is deliberately not awaited by the request, so let it settle.
    await vi.waitFor(async () => {
      const refetched = await SandboxFunctionResource.fetchById(
        auth,
        sandboxFunction.sId
      );
      expect(refetched?.executionMode).toBe("durable");
    });
  });

  it("keeps an immutable Frame publication fast after refusing its tool call", async () => {
    const {
      auth,
      frame,
      publicationId,
      token,
      workspace,
      view,
      sandboxFunction,
    } = await setupFrameWithView({ noTools: true });

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe("fast_function_called_tools");
    expect(body.error.message).toContain("Republish the Frame");
    const refetched =
      await SandboxFunctionResource.fetchByFramePublicationAndSlug(auth, {
        frame,
        publicationId,
        slug: sandboxFunction.slug,
      });
    expect(refetched?.executionMode).toBe("fast");
  });

  it("resolves a durable Frame function in its runtime scope", async () => {
    const { auth, token, workspace, view, invocation, sandboxFunction } =
      await setupFrameWithView();

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    const action = await SandboxFunctionMCPActionResource.fetchById(
      auth,
      body.actionId
    );
    expect(sandboxFunction.frame).not.toBeNull();
    expect(action).toMatchObject({
      sandboxFunctionInvocationId: invocation.id,
      status: "running",
      toolName: "generate_random_number",
    });
  });

  it("leaves a durable function's mode alone when its tool call succeeds", async () => {
    const { auth, token, workspace, view, sandboxFunction } =
      await setupWithView();

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });
    expect(response.status).toBe(202);

    const refetched = await SandboxFunctionResource.fetchById(
      auth,
      sandboxFunction.sId
    );
    expect(refetched?.executionMode).toBe("durable");
  });

  it("returns 404 for an unknown server view", async () => {
    const { token, workspace } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();

    const response = await callSandboxTool(workspace, token, {
      serverViewId: "msv_unknown",
      toolName: "generate_random_number",
      arguments: {},
    });

    expect(response.status).toBe(404);
  });

  it("blocks high-stake tools and publishes an approval event", async () => {
    const context =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const remoteServer = await RemoteMCPServerFactory.create(context.workspace);
    const view = await MCPServerViewFactory.create(
      context.workspace,
      remoteServer.sId,
      context.globalSpace
    );

    const response = await callSandboxTool(context.workspace, context.token, {
      serverViewId: view.sId,
      toolName: "tool",
      arguments: {},
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("pending");

    const action = await SandboxFunctionMCPActionResource.fetchById(
      context.auth,
      body.actionId
    );
    expect(action?.toolConfiguration.permission).toBe("high");
    expect(action?.status).toBe("blocked_validation_required");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).not.toHaveBeenCalled();
    expect(
      vi.mocked(publishSandboxFunctionInvocationEvent)
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_approve_execution",
        actionId: action?.sId,
        sandboxFunctionId: context.sandboxFunction.sId,
        invocationId: context.invocation.sId,
        stake: "high",
        inputs: {},
        metadata: expect.objectContaining({
          toolName: "tool",
        }),
      }),
      { invocationId: context.invocation.sId }
    );
  });

  it("reuses medium-stake approvals for matching tool inputs", async () => {
    const context =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const gmail = await InternalMCPServerInMemoryResource.makeNew(
      context.auth,
      { name: "gmail", useCase: null }
    );
    const view = await MCPServerViewFactory.create(
      context.workspace,
      gmail.id,
      context.globalSpace
    );
    await context.auth.getNonNullableUser().createToolApproval(context.auth, {
      mcpServerId: view.mcpServerId,
      toolName: "create_draft",
      argsAndValues: { to: "approved@dust.tt" },
    });

    const approvedResponse = await callSandboxTool(
      context.workspace,
      context.token,
      {
        serverViewId: view.sId,
        toolName: "create_draft",
        arguments: {
          to: ["approved@dust.tt"],
          subject: "Approved recipient",
          contentType: "text/plain",
          body: "Hello",
        },
      }
    );

    expect(approvedResponse.status).toBe(202);
    const approvedBody = await approvedResponse.json();
    const approvedAction = await SandboxFunctionMCPActionResource.fetchById(
      context.auth,
      approvedBody.actionId
    );
    expect(approvedAction?.toolConfiguration.permission).toBe("medium");
    expect(approvedAction?.status).toBe("running");
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledTimes(
      1
    );

    const blockedResponse = await callSandboxTool(
      context.workspace,
      context.token,
      {
        serverViewId: view.sId,
        toolName: "create_draft",
        arguments: {
          to: ["unapproved@dust.tt"],
          subject: "Unapproved recipient",
          contentType: "text/plain",
          body: "Hello",
        },
      }
    );

    expect(blockedResponse.status).toBe(202);
    const blockedBody = await blockedResponse.json();
    const blockedAction = await SandboxFunctionMCPActionResource.fetchById(
      context.auth,
      blockedBody.actionId
    );
    expect(blockedAction?.status).toBe("blocked_validation_required");
    expect(
      vi.mocked(publishSandboxFunctionInvocationEvent)
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: blockedAction?.sId,
        stake: "medium",
        argumentsRequiringApproval: ["to"],
      }),
      { invocationId: context.invocation.sId }
    );
  });

  it("creates actions for conversation-coupled servers too", async () => {
    // No creation-time gating on the server: tools that require an agent-loop context error at
    // execution based on the run context.
    const context =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const search = await InternalMCPServerInMemoryResource.makeNew(
      context.auth,
      { name: "search", useCase: null }
    );
    const view = await MCPServerViewFactory.create(
      context.workspace,
      search.id,
      context.globalSpace
    );

    const response = await callSandboxTool(context.workspace, context.token, {
      serverViewId: view.sId,
      toolName: "semantic_search",
      arguments: {},
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("pending");
  });

  it("rejects unknown tools on an allowed server", async () => {
    const { token, workspace, view } = await setupWithView();

    const response = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "not_a_tool",
      arguments: {},
    });

    expect(response.status).toBe(400);
  });

  it("replays the existing action when the same idempotency key is resent", async () => {
    const { auth, token, workspace, invocation, view } = await setupWithView();

    const body = {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
      idempotencyKey: "retry-1",
    };

    const first = await callSandboxTool(workspace, token, body);
    expect(first.status).toBe(202);
    const firstBody = await first.json();

    const second = await callSandboxTool(workspace, token, body);
    expect(second.status).toBe(202);
    const secondBody = await second.json();

    expect(secondBody).toEqual({
      status: "pending",
      actionId: firstBody.actionId,
    });
    const actions = await SandboxFunctionMCPActionResource.listByInvocation(
      auth,
      invocation
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]?.idempotencyKey).toBe("retry-1");
    // The replay must not re-execute the tool.
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledTimes(
      1
    );
  });

  it("creates one action per distinct idempotency key", async () => {
    const { auth, token, workspace, invocation, view } = await setupWithView();

    const first = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
      idempotencyKey: "key-a",
    });
    const second = await callSandboxTool(workspace, token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
      idempotencyKey: "key-b",
    });

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.actionId).not.toBe(firstBody.actionId);
    const actions = await SandboxFunctionMCPActionResource.listByInvocation(
      auth,
      invocation
    );
    expect(actions).toHaveLength(2);
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledTimes(
      2
    );
  });

  it("scopes idempotency keys to the invocation", async () => {
    const context = await setupWithView();

    const secondInvocation = await SandboxFunctionInvocationResource.makeNew(
      context.auth,
      { sandboxFunction: context.sandboxFunction, input: undefined }
    );
    const secondToken = await generateSandboxFunctionInvocationToken(
      context.auth,
      {
        sandbox: context.sandbox,
        sandboxFunction: {
          sId: context.sandboxFunction.sId,
          space: { sId: context.podSpace.sId },
        },
        invocationId: secondInvocation.sId,
        execId: `test-function-exec-2-${context.sandbox.sId}`,
        noTools: false,
      }
    );

    const body = {
      serverViewId: context.view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
      idempotencyKey: "shared-key",
    };

    const first = await callSandboxTool(context.workspace, context.token, body);
    expect(first.status).toBe(202);
    const firstBody = await first.json();

    const second = await callSandboxTool(context.workspace, secondToken, body);
    expect(second.status).toBe(202);
    const secondBody = await second.json();

    // Same key, different invocation: no collision, each invocation gets its own action.
    expect(secondBody.actionId).not.toBe(firstBody.actionId);
    expect(vi.mocked(launchSandboxFunctionToolWorkflow)).toHaveBeenCalledTimes(
      2
    );
  });

  it("creates a new action per call when no idempotency key is sent", async () => {
    const { auth, token, workspace, invocation, view } = await setupWithView();

    const body = {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    };

    const first = await callSandboxTool(workspace, token, body);
    const second = await callSandboxTool(workspace, token, body);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.actionId).not.toBe(firstBody.actionId);
    const actions = await SandboxFunctionMCPActionResource.listByInvocation(
      auth,
      invocation
    );
    expect(actions).toHaveLength(2);
  });

  it("reports a view outside the pod and global spaces as not found", async () => {
    // `fetchById` is workspace-scoped, so a view in another space is fetchable: the endpoint
    // must confine to the invocation's pod space + global space, matching the listing.
    const context =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const otherSpace = await SpaceFactory.regular(context.workspace);
    const commonUtilities = await InternalMCPServerInMemoryResource.makeNew(
      context.auth,
      { name: "common_utilities", useCase: null }
    );
    const view = await MCPServerViewFactory.create(
      context.workspace,
      commonUtilities.id,
      otherSpace
    );

    const response = await callSandboxTool(context.workspace, context.token, {
      serverViewId: view.sId,
      toolName: "generate_random_number",
      arguments: { max: 10 },
    });

    expect(response.status).toBe(404);
  });
});
