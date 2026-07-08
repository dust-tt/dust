import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/temporal/agent_loop/client")>();
  return {
    ...actual,
    launchSandboxFunctionToolWorkflow: vi.fn(async () => new Ok(undefined)),
  };
});

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

async function setupWithView() {
  const context =
    await createPersistedSandboxFunctionInvocationTokenTestContext();
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

describe("POST /api/v1/w/[wId]/sandbox/actions/call (function invocation)", () => {
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

  it("rejects tools on non-internal servers", async () => {
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
      toolName: "whatever",
      arguments: {},
    });

    expect(response.status).toBe(400);
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
