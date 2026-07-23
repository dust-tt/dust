import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { ADD_MESSAGE_TO_CONVERSATION_TOOL_NAME } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import createServer from ".";

async function listToolNames(server: McpServer): Promise<string[]> {
  const client = new Client({ name: "pod_manager_test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  await client.close();

  return tools.map((tool) => tool.name);
}

describe("createServer", () => {
  it("omits add_message_to_conversation from sandbox functions", async () => {
    const { auth, workspace, invocation, globalSpace } =
      await createPersistedSandboxFunctionInvocationTokenTestContext();
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      {
        name: "pod_manager",
        useCase: null,
      }
    );
    const view = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
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

    const sandboxFunctionToolNames = await listToolNames(
      createServer(auth, { runContext })
    );
    const toolNamesWithoutRunContext = await listToolNames(createServer(auth));

    expect(sandboxFunctionToolNames).not.toContain(
      ADD_MESSAGE_TO_CONVERSATION_TOOL_NAME
    );
    expect(toolNamesWithoutRunContext).toContain(
      ADD_MESSAGE_TO_CONVERSATION_TOOL_NAME
    );
  });
});
