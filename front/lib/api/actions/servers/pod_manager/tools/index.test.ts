import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import type { ToolContext } from "@app/lib/actions/types";
import createPodManagerServer from "@app/lib/api/actions/servers/pod_manager";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";

const CURRENT_CONVERSATION_ID = "conversation-current";
const ADD_MESSAGE_TOOL_NAME = "add_message_to_conversation";

async function createPodManagerClient() {
  const { auth } = await createPrivateApiMockRequest({ role: "admin" });
  const toolContext = {
    runContext: {
      contextType: "agent_loop",
      agentConfiguration: {
        sId: "agent-id",
        version: 0,
      },
      toolConfiguration: { sId: "tool-configuration-id" },
      conversation: { sId: CURRENT_CONVERSATION_ID },
      agentMessage: { sId: "message-id" },
    },
  } as unknown as ToolContext;
  const server = createPodManagerServer(auth, toolContext);
  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();
  const client = new Client({ name: "pod-manager-test", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return client;
}

describe("Pod manager MCP server", () => {
  it("requires an explicit target for the add-message tool", async () => {
    const client = await createPodManagerClient();

    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === ADD_MESSAGE_TOOL_NAME);

    expect(tool?.inputSchema.required).toContain("conversationId");
    await client.close();
  });

  it("rejects add-message calls targeting the active conversation", async () => {
    const client = await createPodManagerClient();

    const result = await client.callTool({
      name: ADD_MESSAGE_TOOL_NAME,
      arguments: {
        conversationId: CURRENT_CONVERSATION_ID,
        message: "Post this message",
      },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "cannot post to the active conversation"
    );
    await client.close();
  });
});
