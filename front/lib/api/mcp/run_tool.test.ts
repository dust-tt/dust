import type { LightServerSideMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { SANDBOX_TOOL_NAME } from "@app/lib/api/actions/servers/sandbox/metadata";
import { runToolWithStreaming } from "@app/lib/api/mcp/run_tool";
import {
  canStoreSandboxOutput,
  finishSandboxBash,
} from "@app/lib/api/sandbox/sandbox_child_block";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
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
vi.mock("@app/lib/api/sandbox/sandbox_child_block", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox/sandbox_child_block")
    >();
  return {
    ...actual,
    canStoreSandboxOutput: vi.fn().mockResolvedValue(true),
    finishSandboxBash: vi.fn(),
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

describe("runToolWithStreaming (sandbox bash)", () => {
  it("pauses stale failed and successful runs without persisting success output", async () => {
    const { workspace, authenticator: auth } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const sandboxServerId = autoInternalMCPServerNameToSId({
      name: SANDBOX_TOOL_NAME,
      workspaceId: workspace.id,
    });
    const toolConfiguration: LightServerSideMCPToolConfigurationType = {
      id: -1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "bash",
      originalName: "bash",
      mcpServerName: SANDBOX_TOOL_NAME,
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: generateRandomModelSId(),
      dustAppConfiguration: null,
      internalMCPServerId: sandboxServerId,
      secretName: null,
      dustProject: null,
      availability: "auto",
      permission: "never_ask",
      toolServerId: sandboxServerId,
      retryPolicy: "no_retry",
    };
    const { action, agentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig,
        mcpAction: { toolConfiguration },
      });
    if (!action) {
      throw new Error("Expected the sandbox action to exist.");
    }
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Test message",
      rank: 1,
    });
    const { model, ...agentConfiguration } = agentConfig;
    const runContext = {
      contextType: "agent_loop",
      action,
      agentConfiguration,
      agentMessage,
      conversation,
      modelInfo: {
        ...model,
        endpoint: getTestStreamEndpoint(model.modelId),
      },
      stepContext: action.stepContext,
      toolConfiguration,
      userMessage,
    } as const;

    mockToolCallResult({
      isError: true,
      content: [{ type: "text", text: "connection failed" }],
    });
    vi.mocked(finishSandboxBash).mockResolvedValueOnce({
      completed: false,
      outputItems: [],
    });

    const eventTypes = await collectEvents(
      runToolWithStreaming(auth, { toolContext: { runContext } })
    );

    expect(eventTypes).toEqual(["tool_paused"]);

    mockToolCallResult({
      isError: false,
      content: [{ type: "text", text: "stale output" }],
    });
    vi.mocked(canStoreSandboxOutput).mockResolvedValueOnce(false);

    const successEventTypes = await collectEvents(
      runToolWithStreaming(auth, { toolContext: { runContext } })
    );

    expect(successEventTypes).toEqual(["tool_paused"]);
    expect(vi.mocked(canStoreSandboxOutput)).toHaveBeenCalledWith(
      auth,
      action,
      conversation
    );
    expect(vi.mocked(finishSandboxBash)).toHaveBeenCalledTimes(1);
    const outputItems =
      await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
        actionIds: [action.id],
        ignoreContent: false,
      });
    expect(outputItems.get(action.id)).toBeUndefined();
  });
});
