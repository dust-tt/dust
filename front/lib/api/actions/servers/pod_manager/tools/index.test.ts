import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import type { ToolContext } from "@app/lib/actions/types";
import createPodManagerServer from "@app/lib/api/actions/servers/pod_manager";
import type { Authenticator } from "@app/lib/auth";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

const CURRENT_CONVERSATION_ID = "conversation-current";
const ADD_MESSAGE_TOOL_NAME = "add_message_to_conversation";

async function createPodManagerClient({
  auth: providedAuth,
  conversation = { sId: CURRENT_CONVERSATION_ID },
  agentConfiguration = {
    sId: "agent-id",
    version: 0,
  },
}: {
  auth?: Authenticator;
  conversation?: ConversationType | { sId: string };
  agentConfiguration?:
    | AgentConfigurationType
    | { sId: string; version: number };
} = {}) {
  const auth =
    providedAuth ?? (await createPrivateApiMockRequest({ role: "admin" })).auth;
  const toolContext = {
    runContext: {
      contextType: "agent_loop",
      agentConfiguration,
      toolConfiguration: { sId: "tool-configuration-id" },
      conversation,
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

async function createPodConversationTestState() {
  const { auth, user, workspace } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);
  const callingAgent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Calling Agent",
  });
  const targetAgent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Target Agent",
  });
  const currentConversation = await ConversationFactory.create(auth, {
    agentConfigurationId: callingAgent.sId,
    messagesCreatedAt: [],
    spaceId: pod.id,
  });
  const targetConversation = await ConversationFactory.create(auth, {
    agentConfigurationId: callingAgent.sId,
    messagesCreatedAt: [],
    spaceId: pod.id,
  });
  const client = await createPodManagerClient({
    auth,
    conversation: currentConversation,
    agentConfiguration: callingAgent,
  });

  return { client, currentConversation, targetAgent, targetConversation };
}

describe("Pod manager MCP server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an explicit target for the add-message tool", async () => {
    const client = await createPodManagerClient();

    try {
      const { tools } = await client.listTools();
      const tool = tools.find(({ name }) => name === ADD_MESSAGE_TOOL_NAME);

      expect(tool?.inputSchema.required).toContain("conversationId");
      expect(JSON.stringify(tool?.inputSchema)).toContain(
        "respond normally without this tool"
      );
    } finally {
      await client.close();
    }
  });

  it("rejects ordinary add-message calls targeting the active conversation", async () => {
    const client = await createPodManagerClient();

    try {
      const result = await client.callTool({
        name: ADD_MESSAGE_TOOL_NAME,
        arguments: {
          conversationId: CURRENT_CONVERSATION_ID,
          message: "Post this message",
        },
      });

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        "requires agentName for an explicit handoff"
      );
    } finally {
      await client.close();
    }
  });

  it("posts to a different conversation without triggering an agent", async () => {
    const { client, targetConversation } =
      await createPodConversationTestState();

    try {
      const result = await client.callTool({
        name: ADD_MESSAGE_TOOL_NAME,
        arguments: {
          conversationId: targetConversation.sId,
          message: "Post this message",
        },
      });

      expect(result.isError).toBe(false);
      expect(JSON.stringify(result.content)).toContain(targetConversation.sId);
      expect(launchAgentLoopWorkflow).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it("allows an explicit named-agent handoff in the active conversation", async () => {
    const { client, currentConversation, targetAgent } =
      await createPodConversationTestState();

    try {
      const result = await client.callTool({
        name: ADD_MESSAGE_TOOL_NAME,
        arguments: {
          conversationId: currentConversation.sId,
          message: "Please take over",
          agentName: targetAgent.name,
        },
      });

      expect(result.isError).toBe(false);
      expect(JSON.stringify(result.content)).toContain(currentConversation.sId);
      expect(launchAgentLoopWorkflow).toHaveBeenCalledOnce();
    } finally {
      await client.close();
    }
  });
});
