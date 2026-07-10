import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { runToolWithStreaming } from "@app/lib/api/mcp/run_tool";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
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

function mockToolCallResult(result: CallToolResult) {
  vi.mocked(tryCallMCPTool).mockImplementation(async function* () {
    return result;
  });
}

async function setupSandboxFunctionRun() {
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

  const runContext: SandboxFunctionRunContext = {
    contextType: "sandbox_function",
    action,
    invocation,
    toolConfiguration: action.toolConfiguration,
  };

  return { auth, workspace, action, runContext };
}

async function collectEvents(
  stream: ReturnType<typeof runToolWithStreaming>
): Promise<string[]> {
  const eventTypes: string[] = [];
  for await (const event of stream) {
    eventTypes.push(event.type);
  }
  return eventTypes;
}

describe("runToolWithStreaming (sandbox function run context)", () => {
  it("should mark the action succeeded and persist the output to a single GCS object", async () => {
    const { auth, workspace, action, runContext } =
      await setupSandboxFunctionRun();

    const content: CallToolResult["content"] = [{ type: "text", text: "42" }];
    mockToolCallResult({ isError: false, content });

    const eventTypes = await collectEvents(
      runToolWithStreaming(auth, { toolContext: { runContext } })
    );

    expect(eventTypes).toEqual(["tool_success"]);

    const refetched =
      await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
    expect(refetched?.status).toBe("succeeded");
    expect(refetched?.executionDurationMs).toEqual(expect.any(Number));
    expect(refetched?.outputGcsPath).toBe(
      `w/${workspace.sId}/mcp_output_items/${action.sId}/output.json`
    );

    const outputWrite = fileStorageMock.saveFileCalls.find((call) =>
      call.filePath.endsWith(`mcp_output_items/${action.sId}/output.json`)
    );
    expect(outputWrite).toBeDefined();
    expect(JSON.parse(outputWrite?.content.toString() ?? "")).toEqual(content);
  });

  it("should mark the action errored and persist the error content on a tool error", async () => {
    const { auth, action, runContext } = await setupSandboxFunctionRun();

    const errorContent: CallToolResult["content"] = [
      { type: "text", text: "tool exploded" },
    ];
    mockToolCallResult({ isError: true, content: errorContent });

    // `handleMCPActionError` yields tool_success so the agent loop continues; the sandbox
    // activity drains it.
    const eventTypes = await collectEvents(
      runToolWithStreaming(auth, { toolContext: { runContext } })
    );

    expect(eventTypes).toEqual(["tool_success"]);

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
    expect(JSON.parse(outputWrite?.content.toString() ?? "")).toEqual(
      errorContent
    );
  });
});
