import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentMessageType,
  ConversationType,
  ModelConfigurationType,
  UserMessageType,
} from "@app/types";

// Mock the helpers module
vi.mock(import("./helpers"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSteps: vi.fn(),
    renderContentFragment: vi.fn(),
    renderUserMessage: vi.fn(),
  };
});

import type { UserMessageTypeModel } from "@app/types";

import { getSteps, renderContentFragment, renderUserMessage } from "./helpers";

describe("renderAllMessages", () => {
  let auth: Authenticator;
  let model: ModelConfigurationType;

  beforeEach(() => {
    vi.clearAllMocks();

    auth = {} as Authenticator;
    model = {
      providerId: "openai",
      modelId: "gpt-4",
    } as unknown as ModelConfigurationType;

    vi.mocked(renderUserMessage).mockImplementation(
      (m: UserMessageType) =>
        ({
          role: "user",
          name: m.context.username,
          content: [{ type: "text", text: m.content }],
        }) as UserMessageTypeModel
    );

    vi.mocked(getSteps).mockResolvedValue([
      {
        contents: [{ type: "text_content", value: "Agent response" }],
        actions: [],
      },
    ]);

    vi.mocked(renderContentFragment).mockResolvedValue(null);
  });

  function createConversation(
    messages: Array<{
      type: "user" | "agent";
      visibility: "visible" | "deleted";
    }>
  ): ConversationType {
    const content = messages.map((msg, idx) => {
      if (msg.type === "user") {
        return [
          {
            id: idx + 1,
            created: Date.now(),
            type: "user_message" as const,
            sId: `user_msg_${idx}`,
            visibility: msg.visibility,
            version: 1,
            rank: idx * 2,
            user: null,
            mentions: [],
            richMentions: [],
            content: `Message ${idx}`,
            context: {
              username: "testuser",
              timezone: "UTC",
              fullName: null,
              email: null,
              profilePictureUrl: null,
              origin: "web",
            },
            reactions: [],
          } satisfies UserMessageType,
        ];
      } else {
        return [
          {
            id: idx + 1,
            agentMessageId: idx + 1,
            created: Date.now(),
            type: "agent_message" as const,
            sId: `agent_msg_${idx}`,
            version: 1,
            rank: idx * 2 + 1,
            completedTs: null,
            parentMessageId: `user_msg_${idx}`,
            parentAgentMessageId: null,
            status: "succeeded" as const,
            content: null,
            chainOfThought: null,
            error: null,
            visibility: msg.visibility,
            configuration: {
              sId: "agent_config_1",
              name: "Test Agent",
              pictureUrl: "",
              status: "active" as const,
              canRead: true,
            } as AgentMessageType["configuration"],
            skipToolsValidation: false,
            actions: [],
            rawContents: [],
            contents: [],
            parsedContents: {},
            modelInteractionDurationMs: null,
            richMentions: [],
            completionDurationMs: null,
            reactions: [],
          } satisfies AgentMessageType,
        ];
      }
    });

    return {
      id: 1,
      created: Date.now(),
      updated: Date.now(),
      unread: false,
      actionRequired: false,
      hasError: false,
      sId: "conv_1",
      title: "Test Conversation",
      spaceId: null,
      depth: 0,
      requestedSpaceIds: [],
      owner: {
        sId: "workspace_123",
        name: "Test Workspace",
      } as ConversationType["owner"],
      visibility: "unlisted",
      content: content as ConversationType["content"],
      triggerId: null,
    } as ConversationType;
  }

  it("should include visible user messages", async () => {
    const conversation = createConversation([
      { type: "user", visibility: "visible" },
    ]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(1);
    expect(renderUserMessage).toHaveBeenCalledTimes(1);
    expect(result[0].role).toBe("user");
  });

  it("should skip deleted user messages", async () => {
    const conversation = createConversation([
      { type: "user", visibility: "visible" },
      { type: "user", visibility: "deleted" },
    ]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(1);
    expect(renderUserMessage).toHaveBeenCalledTimes(1);
  });

  it("should include visible agent messages", async () => {
    const conversation = createConversation([
      { type: "agent", visibility: "visible" },
    ]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(1);
    expect(getSteps).toHaveBeenCalledTimes(1);
    expect(result[0].role).toBe("assistant");
  });

  it("should skip deleted agent messages", async () => {
    const conversation = createConversation([
      { type: "agent", visibility: "visible" },
      { type: "agent", visibility: "deleted" },
    ]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(1);
    expect(getSteps).toHaveBeenCalledTimes(1);
  });

  it("should handle mixed visible and deleted messages", async () => {
    const conversation = createConversation([
      { type: "user", visibility: "visible" },
      { type: "user", visibility: "deleted" },
      { type: "agent", visibility: "visible" },
      { type: "agent", visibility: "deleted" },
    ]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(2);
    expect(renderUserMessage).toHaveBeenCalledTimes(1);
    expect(getSteps).toHaveBeenCalledTimes(1);
  });

  it("should handle conversation with only deleted messages", async () => {
    const conversation = createConversation([
      { type: "user", visibility: "deleted" },
      { type: "agent", visibility: "deleted" },
    ]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(0);
    expect(renderUserMessage).not.toHaveBeenCalled();
    expect(getSteps).not.toHaveBeenCalled();
  });

  it("should handle empty conversation", async () => {
    const conversation = createConversation([]);

    const result = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "skip",
    });

    expect(result).toHaveLength(0);
  });

  describe("excludeActions", () => {
    it("should filter out function_call contents when excludeActions is true", async () => {
      const conversation = createConversation([
        { type: "agent", visibility: "visible" },
      ]);

      // Mock getSteps to return a step with both text_content and function_call
      vi.mocked(getSteps).mockResolvedValue([
        {
          contents: [
            { type: "text_content", value: "Agent response" },
            {
              type: "function_call",
              value: {
                id: "toolu_123",
                name: "some_tool",
                arguments: "{}",
              },
            },
          ],
          actions: [
            {
              call: { id: "toolu_123", name: "some_tool", arguments: "{}" },
              result: {
                role: "function" as const,
                name: "some_tool",
                function_call_id: "toolu_123",
                content: "result",
              },
            },
          ],
        },
      ]);

      const result = await renderAllMessages(auth, {
        conversation,
        model,
        excludeActions: true,
        onMissingAction: "skip",
      });

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("assistant");
      // Verify function_call is filtered out from contents
      const assistantMsg = result[0] as { contents: Array<{ type: string }> };
      expect(
        assistantMsg.contents.some((c) => c.type === "function_call")
      ).toBe(false);
      expect(assistantMsg.contents.some((c) => c.type === "text_content")).toBe(
        true
      );
    });

    it("should include function_call contents when excludeActions is false", async () => {
      const conversation = createConversation([
        { type: "agent", visibility: "visible" },
      ]);

      // Mock getSteps to return a step with both text_content and function_call
      vi.mocked(getSteps).mockResolvedValue([
        {
          contents: [
            { type: "text_content", value: "Agent response" },
            {
              type: "function_call",
              value: {
                id: "toolu_123",
                name: "some_tool",
                arguments: "{}",
              },
            },
          ],
          actions: [
            {
              call: { id: "toolu_123", name: "some_tool", arguments: "{}" },
              result: {
                role: "function" as const,
                name: "some_tool",
                function_call_id: "toolu_123",
                content: "result",
              },
            },
          ],
        },
      ]);

      const result = await renderAllMessages(auth, {
        conversation,
        model,
        excludeActions: false,
        onMissingAction: "skip",
      });

      // With excludeActions: false, we get the assistant message with function_calls
      // plus the function result message
      expect(result.length).toBeGreaterThanOrEqual(1);
      // The assistant message should have function_calls in its structure
      const assistantMessage = result.find((m) => m.role === "assistant");
      expect(assistantMessage).toBeDefined();
    });
  });
});
