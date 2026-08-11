import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { runAgent } from "@app/lib/api/actions/servers/run_agent";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("runAgent from a sandbox-function run context", () => {
  it("returns a typed refusal instead of an internal assertion error", async () => {
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
    const runContext: SandboxFunctionRunContext = {
      contextType: "sandbox_function",
      action,
      invocation,
      toolConfiguration: action.toolConfiguration,
    };

    const result = await runAgent(
      {
        query: "Summarize the latest updates.",
        childAgentId: "agent_123",
        executionMode: "run-agent",
      },
      {
        auth,
        toolContext: { runContext },
        toolName: "run_agent",
      }
    );

    assert(result.isErr());
    expect(result.error.message).toContain(
      "Creating conversations or invoking agents from a Pod function is not supported"
    );
  });
});
