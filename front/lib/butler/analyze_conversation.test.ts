import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { analyzeConversation } from "@app/lib/butler/analyze_conversation";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getFastestWhitelistedModel } from "@app/types/assistant/assistant";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock LLM-related modules (external service calls).
vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/conversation_rendering", () => ({
  renderConversationForModel: vi.fn(),
}));

// Mock event publishing to avoid Redis dependency.
vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishConversationEvent: vi.fn(),
}));

// Mock model selection to avoid plan/whitelist dependency.
vi.mock("@app/types/assistant/assistant", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...(mod as object),
    getFastestWhitelistedModel: vi.fn(),
  };
});

// Mock agent configuration fetching.
vi.mock("@app/lib/api/assistant/configuration/views", () => ({
  getAgentConfigurationsForView: vi.fn(),
}));

const mockGetFastestModel = vi.mocked(getFastestWhitelistedModel);
const mockPublishConversationEvent = vi.mocked(publishConversationEvent);
const mockRenderConversation = vi.mocked(renderConversationForModel);
const mockRunMultiActionsAgent = vi.mocked(runMultiActionsAgent);
const mockGetAgentConfigurations = vi.mocked(getAgentConfigurationsForView);

// Use clearAllMocks (not resetAllMocks) to preserve global mock implementations from vite.setup.ts.
beforeEach(() => {
  vi.clearAllMocks();
  // Default: no agents available.
  mockGetAgentConfigurations.mockResolvedValue([] as never);
});

const FAKE_MODEL = {
  providerId: "openai" as const,
  modelId: "gpt-4o-mini" as const,
  contextSize: 128000,
  generationTokensCount: 4096,
};

function setupMocksForHighConfidenceRename() {
  mockGetFastestModel.mockReturnValue(FAKE_MODEL as never);

  mockRenderConversation.mockResolvedValue(
    new Ok({
      modelConversation: {
        messages: [
          {
            role: "user" as const,
            name: "User",
            content: [{ type: "text" as const, text: "Hello" }],
          },
        ],
      },
      tokensUsed: 100,
      prunedContext: false,
    }) as never
  );

  mockRunMultiActionsAgent.mockResolvedValue(
    new Ok({
      actions: [
        {
          name: "analyze_conversation",
          arguments: {
            rename_confidence: 85,
            new_title: "Better Title",
            agent_confidence: 0,
            agent_name: "",
            agent_prompt: "",
          },
        },
      ],
    }) as never
  );
}

function setupMocksForRender() {
  mockGetFastestModel.mockReturnValue(FAKE_MODEL as never);
  mockRenderConversation.mockResolvedValue(
    new Ok({
      modelConversation: {
        messages: [
          {
            role: "user" as const,
            name: "User",
            content: [{ type: "text" as const, text: "Hello" }],
          },
        ],
      },
      tokensUsed: 100,
      prunedContext: false,
    }) as never
  );
}

describe("analyzeConversation", () => {
  it("creates a rename_title suggestion when confidence is high", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });
    expect(message).not.toBeNull();

    setupMocksForHighConfidenceRename();

    await analyzeConversation(authenticator, {
      conversation,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestionType).toBe("rename_title");
    expect(suggestions[0].metadata).toEqual({
      suggestedTitle: "Better Title",
    });
    expect(suggestions[0].status).toBe("pending");
    expect(suggestions[0].sourceMessageId).toBe(message!.id);
    expect(suggestions[0].conversationId).toBe(conversation.id);

    // Verify the event was published to the conversation channel.
    expect(mockPublishConversationEvent).toHaveBeenCalledOnce();
    expect(mockPublishConversationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "butler_suggestion_created",
        suggestion: expect.objectContaining({
          suggestionType: "rename_title",
          metadata: { suggestedTitle: "Better Title" },
          sourceMessageSId: message!.sId,
        }),
      }),
      { conversationId: conversation.sId }
    );
  });

  it("does not create suggestion when confidence is below threshold", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });
    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });

    setupMocksForRender();
    mockRunMultiActionsAgent.mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "analyze_conversation",
            arguments: {
              rename_confidence: 40,
              new_title: "Some Title",
              agent_confidence: 0,
              agent_name: "",
              agent_prompt: "",
            },
          },
        ],
      }) as never
    );

    await analyzeConversation(authenticator, {
      conversation,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("does not create suggestion when proposed title matches current title", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });
    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });

    setupMocksForRender();
    // LLM suggests the same title as the factory-created one (case-insensitive match).
    mockRunMultiActionsAgent.mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "analyze_conversation",
            arguments: {
              rename_confidence: 90,
              new_title: "  test conversation  ",
              agent_confidence: 0,
              agent_name: "",
              agent_prompt: "",
            },
          },
        ],
      }) as never
    );

    await analyzeConversation(authenticator, {
      conversation,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("handles LLM errors gracefully without creating a suggestion", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    setupMocksForRender();
    mockRunMultiActionsAgent.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: new Error("LLM call failed"),
    } as never);

    // Should not throw.
    await analyzeConversation(authenticator, {
      conversation,
      messageId: "any-msg-id",
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("creates a call_agent suggestion when confidence is high and agent matches", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });
    expect(message).not.toBeNull();

    // Mock available agents.
    mockGetAgentConfigurations.mockResolvedValue([
      { sId: "agent-1", name: "CodeHelper", description: "Helps with code" },
    ] as never);

    setupMocksForRender();
    mockRunMultiActionsAgent.mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "analyze_conversation",
            arguments: {
              rename_confidence: 20,
              new_title: "",
              agent_confidence: 85,
              agent_name: "CodeHelper",
              agent_prompt: "Can you help me debug this issue?",
            },
          },
        ],
      }) as never
    );

    await analyzeConversation(authenticator, {
      conversation,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestionType).toBe("call_agent");
    expect(suggestions[0].metadata).toEqual({
      agentSId: "agent-1",
      agentName: "CodeHelper",
      prompt: "Can you help me debug this issue?",
    });
  });

  it("creates both suggestions when both have high confidence", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });
    expect(message).not.toBeNull();

    mockGetAgentConfigurations.mockResolvedValue([
      { sId: "agent-1", name: "CodeHelper", description: "Helps with code" },
    ] as never);

    setupMocksForRender();
    mockRunMultiActionsAgent.mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "analyze_conversation",
            arguments: {
              rename_confidence: 85,
              new_title: "Better Title",
              agent_confidence: 80,
              agent_name: "CodeHelper",
              agent_prompt: "Can you help?",
            },
          },
        ],
      }) as never
    );

    await analyzeConversation(authenticator, {
      conversation,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(2);

    const types = suggestions.map((s) => s.suggestionType).sort();
    expect(types).toEqual(["call_agent", "rename_title"]);
    expect(mockPublishConversationEvent).toHaveBeenCalledTimes(2);
  });

  it("skips call_agent suggestion when agent name does not match", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });

    mockGetAgentConfigurations.mockResolvedValue([
      { sId: "agent-1", name: "CodeHelper", description: "Helps with code" },
    ] as never);

    setupMocksForRender();
    mockRunMultiActionsAgent.mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "analyze_conversation",
            arguments: {
              rename_confidence: 20,
              new_title: "",
              agent_confidence: 90,
              agent_name: "NonExistentAgent",
              agent_prompt: "Help me",
            },
          },
        ],
      }) as never
    );

    await analyzeConversation(authenticator, {
      conversation,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  describe("rename_title throttling", () => {
    it("skips rename when a pending suggestion exists within cooldown", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "admin",
      });
      const agentConfig =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date(), new Date()],
      });

      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        order: [["rank", "ASC"]],
      });

      // First call: creates a rename_title suggestion.
      setupMocksForHighConfidenceRename();
      await analyzeConversation(authenticator, {
        conversation,
        messageId: messages[0].sId,
      });

      let suggestions = await ConversationButlerSuggestionModel.findAll({
        where: { workspaceId: workspace.id, suggestionType: "rename_title" },
      });
      expect(suggestions).toHaveLength(1);

      // Second call from a nearby message: should be throttled.
      vi.clearAllMocks();
      mockGetAgentConfigurations.mockResolvedValue([] as never);
      setupMocksForHighConfidenceRename();
      await analyzeConversation(authenticator, {
        conversation,
        messageId: messages[1].sId,
      });

      suggestions = await ConversationButlerSuggestionModel.findAll({
        where: { workspaceId: workspace.id, suggestionType: "rename_title" },
      });
      // Still only 1 — the second was throttled.
      expect(suggestions).toHaveLength(1);
    });

    it("auto-dismisses stale pending suggestion and creates a new one", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "admin",
      });
      const agentConfig =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a conversation with many messages so we have enough rank distance.
      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: Array.from({ length: 8 }, () => new Date()),
      });

      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        order: [["rank", "ASC"]],
      });

      // First call: creates a rename_title suggestion from message at rank 0.
      setupMocksForHighConfidenceRename();
      await analyzeConversation(authenticator, {
        conversation,
        messageId: messages[0].sId,
      });

      let suggestions = await ConversationButlerSuggestionModel.findAll({
        where: { workspaceId: workspace.id, suggestionType: "rename_title" },
      });
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].status).toBe("pending");
      const firstSuggestionId = suggestions[0].id;

      // Second call from a message with rank >= 10 (rank distance > cooldown).
      // With 8 messagesCreatedAt, ranks go 0..15. The last message is at rank 15.
      const lastMessage = messages[messages.length - 1];
      expect(lastMessage.rank).toBeGreaterThanOrEqual(10);

      vi.clearAllMocks();
      mockGetAgentConfigurations.mockResolvedValue([] as never);
      setupMocksForHighConfidenceRename();
      await analyzeConversation(authenticator, {
        conversation,
        messageId: lastMessage.sId,
      });

      suggestions = await ConversationButlerSuggestionModel.findAll({
        where: { workspaceId: workspace.id, suggestionType: "rename_title" },
        order: [["createdAt", "ASC"]],
      });
      // Old one auto-dismissed + new one created.
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].id).toBe(firstSuggestionId);
      expect(suggestions[0].status).toBe("dismissed");
      expect(suggestions[1].status).toBe("pending");
    });

    it("respects cooldown after a dismissed suggestion", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "admin",
      });
      const agentConfig =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date(), new Date()],
      });

      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        order: [["rank", "ASC"]],
      });

      // First call: creates a rename_title suggestion.
      setupMocksForHighConfidenceRename();
      await analyzeConversation(authenticator, {
        conversation,
        messageId: messages[0].sId,
      });

      // Manually dismiss it.
      await ConversationButlerSuggestionModel.update(
        { status: "dismissed" },
        {
          where: {
            workspaceId: workspace.id,
            suggestionType: "rename_title",
          },
        }
      );

      // Second call from a nearby message: should still be throttled (cooldown).
      vi.clearAllMocks();
      mockGetAgentConfigurations.mockResolvedValue([] as never);
      setupMocksForHighConfidenceRename();
      await analyzeConversation(authenticator, {
        conversation,
        messageId: messages[1].sId,
      });

      const suggestions = await ConversationButlerSuggestionModel.findAll({
        where: { workspaceId: workspace.id, suggestionType: "rename_title" },
      });
      // Still only 1 — the cooldown prevented a new one.
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].status).toBe("dismissed");
    });
  });
});
