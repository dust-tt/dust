import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { buildMcpAuthInfo } from "@app/lib/api/mcp_server/context";
import { createDustMcpServer } from "@app/lib/api/mcp_server/server";
import { isWorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";
import type { WorkOSWorkspaceAuthenticator } from "@app/lib/api/workos_authenticator";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CLAUDE_OPUS_5_5_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

vi.mock("@app/lib/api/programmatic_usage/tracking", () => ({
  isProgrammaticUsage: () => false,
  checkProgrammaticUsageLimits: vi.fn(),
}));

function requireMcpAuth(auth: Authenticator): WorkOSWorkspaceAuthenticator {
  if (!isWorkOSWorkspaceAuthenticator(auth)) {
    throw new Error("Expected WorkOS workspace authenticator for MCP tests.");
  }
  return auth;
}

async function connectAuthenticatedMcpClient(authenticator: Authenticator) {
  const mcpAuth = requireMcpAuth(authenticator);
  const server = createDustMcpServer();
  const client = new Client({ name: "dust-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();

  clientTransport.setAuthInfo(buildMcpAuthInfo(mcpAuth, "test-token"));

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, close: () => client.close() };
}

type McpToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
};

function asMcpToolResult(result: unknown): McpToolResult {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray((result as { content: unknown }).content)
  ) {
    throw new Error("Unexpected MCP tool result shape");
  }
  return result as McpToolResult;
}

function toolText(result: unknown): string {
  const text = asMcpToolResult(result).content.find((c) => c.type === "text");
  if (text?.type !== "text" || text.text === undefined) {
    throw new Error("Expected text content from MCP tool result");
  }
  return text.text;
}

describe("Dust MCP conversation modelSelection", () => {
  it("exposes modelSelection on create_conversation and create_conversation_message", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const { client, close } =
      await connectAuthenticatedMcpClient(authenticator);

    try {
      const { tools } = await client.listTools();

      for (const toolName of [
        "create_conversation",
        "create_conversation_message",
      ] as const) {
        expect(tools).toContainEqual(
          expect.objectContaining({
            name: toolName,
            inputSchema: expect.objectContaining({
              properties: expect.objectContaining({
                modelSelection: expect.objectContaining({
                  type: "object",
                  properties: expect.objectContaining({
                    providerId: expect.anything(),
                    modelId: expect.anything(),
                    reasoningEffort: expect.anything(),
                  }),
                }),
              }),
            }),
          })
        );
      }
    } finally {
      await close();
    }
  });

  it("persists modelSelection on create_conversation_message", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { client, close } =
      await connectAuthenticatedMcpClient(authenticator);

    const modelSelection = {
      providerId: "anthropic" as const,
      modelId: CLAUDE_OPUS_5_5_MODEL_ID,
      reasoningEffort: "medium" as const,
    };

    try {
      const result = await client.callTool({
        name: "create_conversation_message",
        arguments: {
          conversationId: conversation.sId,
          message: "Hello with model override",
          agentName: null,
          modelSelection,
        },
      });

      expect(asMcpToolResult(result).isError).toBeFalsy();
      const body = JSON.parse(toolText(result)) as {
        userMessageId: string;
      };
      const conversationResource = await ConversationResource.fetchById(
        authenticator,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      const messageRes = await conversationResource!.getMessageById(
        authenticator,
        body.userMessageId
      );
      expect(messageRes.isOk()).toBe(true);
      if (messageRes.isErr()) {
        throw messageRes.error;
      }

      expect(messageRes.value.userMessage?.requestedProviderId).toBe(
        modelSelection.providerId
      );
      expect(messageRes.value.userMessage?.requestedModelId).toBe(
        modelSelection.modelId
      );
      expect(messageRes.value.userMessage?.requestedReasoningEffort).toBe(
        modelSelection.reasoningEffort
      );
    } finally {
      await close();
    }
  });

  it("rejects an unknown modelSelection on create_conversation_message", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { client, close } =
      await connectAuthenticatedMcpClient(authenticator);

    try {
      const result = await client.callTool({
        name: "create_conversation_message",
        arguments: {
          conversationId: conversation.sId,
          message: "Hello",
          agentName: null,
          modelSelection: {
            providerId: "anthropic",
            modelId: "not-a-real-model",
          },
        },
      });

      expect(asMcpToolResult(result).isError).toBe(true);
      expect(toolText(result)).toMatch(
        /Invalid arguments|invalid_enum_value|modelId/i
      );
    } finally {
      await close();
    }
  });

  it("rejects a modelSelection that is not authorized for the workspace", async () => {
    // Opus is premium; basic plan cannot select it.
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "basic",
    });
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const { client, close } =
      await connectAuthenticatedMcpClient(authenticator);

    try {
      const result = await client.callTool({
        name: "create_conversation_message",
        arguments: {
          conversationId: conversation.sId,
          message: "Hello",
          agentName: null,
          modelSelection: {
            providerId: "anthropic",
            modelId: CLAUDE_OPUS_5_5_MODEL_ID,
            reasoningEffort: "medium",
          },
        },
      });

      expect(asMcpToolResult(result).isError).toBe(true);
      expect(toolText(result)).toContain("not authorized");
    } finally {
      await close();
    }
  });

  it("persists modelSelection on create_conversation when posting a first message", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
      plan: "creditPriced",
    });

    const { client, close } =
      await connectAuthenticatedMcpClient(authenticator);

    const modelSelection = {
      providerId: "anthropic" as const,
      modelId: CLAUDE_OPUS_5_5_MODEL_ID,
      reasoningEffort: "high" as const,
    };

    try {
      const result = await client.callTool({
        name: "create_conversation",
        arguments: {
          title: "MCP model override",
          message: "First message with model override",
          agentName: null,
          modelSelection,
        },
      });

      expect(asMcpToolResult(result).isError).toBeFalsy();
      const body = JSON.parse(toolText(result)) as {
        conversationId: string;
        userMessageId: string;
      };

      const conversationResource = await ConversationResource.fetchById(
        authenticator,
        body.conversationId
      );
      expect(conversationResource).not.toBeNull();

      const messageRes = await conversationResource!.getMessageById(
        authenticator,
        body.userMessageId
      );
      expect(messageRes.isOk()).toBe(true);
      if (messageRes.isErr()) {
        throw messageRes.error;
      }

      expect(messageRes.value.userMessage?.requestedProviderId).toBe(
        modelSelection.providerId
      );
      expect(messageRes.value.userMessage?.requestedModelId).toBe(
        modelSelection.modelId
      );
      expect(messageRes.value.userMessage?.requestedReasoningEffort).toBe(
        modelSelection.reasoningEffort
      );
    } finally {
      await close();
    }
  });
});
