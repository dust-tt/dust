import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { ADD_MESSAGE_TO_CONVERSATION_TOOL_NAME } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { describe, expect, it } from "vitest";

import { createProjectManagerTools } from ".";

describe("createProjectManagerTools", () => {
  it("omits add_message_to_conversation from sandbox functions", async () => {
    const { auth, workspace, invocation, globalSpace } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "pod_manager",
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

    const sandboxFunctionTools = createProjectManagerTools(auth, {
      runContext,
    });
    const toolsWithoutRunContext = createProjectManagerTools(auth);

    expect(sandboxFunctionTools.map((tool) => tool.name)).not.toContain(
      ADD_MESSAGE_TO_CONVERSATION_TOOL_NAME
    );
    expect(toolsWithoutRunContext.map((tool) => tool.name)).toContain(
      ADD_MESSAGE_TO_CONVERSATION_TOOL_NAME
    );
  });
});
