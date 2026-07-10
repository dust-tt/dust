import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { runSandboxFunctionToolActivity } from "@app/temporal/agent_loop/activities/run_sandbox_function_tool";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import type { AgentPauseOutputResourceType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/actions/mcp_actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/actions/mcp_actions")>();
  return {
    ...actual,
    tryCallMCPTool: vi.fn(),
  };
});

// The activity reads the temporal cancellation signal and heartbeats; neither exists outside a
// real activity context.
vi.mock("@temporalio/activity", () => ({
  Context: {
    current: () => ({ cancellationSignal: new AbortController().signal }),
  },
  heartbeat: vi.fn(),
}));

function mockToolCallResult(result: CallToolResult) {
  vi.mocked(tryCallMCPTool).mockImplementation(async function* () {
    return result;
  });
}

async function setupActivityRun() {
  const { auth, workspace, invocation, globalSpace } =
    await createPersistedSandboxFunctionInvocationTokenTestContext();
  const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name: "common_utilities",
    useCase: null,
  });
  const view = await MCPServerViewFactory.create(
    workspace,
    server.id,
    globalSpace
  );
  const action = await SandboxFunctionMCPActionFactory.create(auth, {
    invocation,
    mcpServerView: view,
  });

  fileStorageMock.reset();

  return { auth, workspace, action };
}

describe("runSandboxFunctionToolActivity", () => {
  it("should mark the action succeeded on a normal tool result", async () => {
    const { auth, action } = await setupActivityRun();

    mockToolCallResult({
      isError: false,
      content: [{ type: "text", text: "42" }],
    });

    await runSandboxFunctionToolActivity(auth.toJSON(), {
      actionModelId: action.id,
    });

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
    expect(refetched?.status).toBe("succeeded");
  });

  it("should fail closed to errored when the tool requires personal authentication", async () => {
    const { auth, action } = await setupActivityRun();

    // Pause resources yield events without a terminal status; with no pause surface for function
    // invocations the activity must fail closed, otherwise the action stays `running` and the
    // poll hangs until token expiry. The resource lands in the output so the function sees what
    // the tool needs.
    const authRequiredResource: AgentPauseOutputResourceType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
      type: "tool_personal_auth_required",
      provider: "google_drive",
      text: "Personal authentication required.",
      uri: "",
    };
    const content: CallToolResult["content"] = [
      { type: "resource", resource: authRequiredResource },
    ];
    mockToolCallResult({ isError: false, content });

    await runSandboxFunctionToolActivity(auth.toJSON(), {
      actionModelId: action.id,
    });

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
    expect(refetched?.status).toBe("errored");

    const outputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.endsWith(`mcp_output_items/${action.sId}/output.json`)
    );
    expect(outputWrite).toBeDefined();
    expect(JSON.parse(outputWrite?.content.toString() ?? "")).toEqual(content);
  });

  it("should fail closed to errored on a non-error early exit", async () => {
    const { auth, action } = await setupActivityRun();

    const earlyExitResource: AgentPauseOutputResourceType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
      type: "tool_early_exit",
      text: "Done early.",
      isError: false,
      uri: "",
    };
    mockToolCallResult({
      isError: false,
      content: [{ type: "resource", resource: earlyExitResource }],
    });

    await runSandboxFunctionToolActivity(auth.toJSON(), {
      actionModelId: action.id,
    });

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
    expect(refetched?.status).toBe("errored");
  });
});
