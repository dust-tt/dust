import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { evaluateRenameTitleSuggestion } from "@app/lib/butler/suggest_rename_title";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getFastestWhitelistedModel } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
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

const mockGetFastestModel = vi.mocked(getFastestWhitelistedModel);
const mockPublishConversationEvent = vi.mocked(publishConversationEvent);
const mockRenderConversation = vi.mocked(renderConversationForModel);
const mockRunMultiActionsAgent = vi.mocked(runMultiActionsAgent);

// Use clearAllMocks (not resetAllMocks) to preserve global mock implementations from vite.setup.ts.
beforeEach(() => {
  vi.clearAllMocks();
});

const FAKE_MODEL = {
  providerId: "openai" as const,
  modelId: "gpt-4o-mini" as const,
  contextSize: 128000,
  generationTokensCount: 4096,
};

function makeFakeConversation(
  overrides: Partial<ConversationType> = {}
): ConversationType {
  return {
    id: 1,
    sId: "fake-conv-sid",
    created: Date.now(),
    updated: Date.now(),
    unread: false,
    lastReadMs: null,
    actionRequired: false,
    hasError: false,
    title: "Old auto-generated title",
    spaceId: null,
    triggerId: null,
    depth: 0,
    metadata: {},
    owner: {} as ConversationType["owner"],
    visibility: "unlisted",
    content: [[], [], [], []],
    ...overrides,
  } as ConversationType;
}

function setupMocksForHighConfidence() {
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
          name: "rename_title_decision",
          arguments: { confidence: 85, new_title: "Better Title" },
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

describe("evaluateRenameTitleSuggestion", () => {
  it("creates a rename_title suggestion when confidence is high", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    // Create a real conversation + message in DB for FK constraints.
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    const message = await MessageModel.findOne({
      where: { conversationId: conversation.id, workspaceId: workspace.id },
    });
    expect(message).not.toBeNull();

    const fakeConversation = makeFakeConversation({
      id: conversation.id,
      sId: conversation.sId,
    });
    setupMocksForHighConfidence();

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: fakeConversation,
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
            name: "rename_title_decision",
            arguments: { confidence: 40, new_title: "Some Title" },
          },
        ],
      }) as never
    );

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation(),
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
    // LLM suggests the same title (case-insensitive match).
    mockRunMultiActionsAgent.mockResolvedValue(
      new Ok({
        actions: [
          {
            name: "rename_title_decision",
            arguments: {
              confidence: 90,
              new_title: "  my existing title  ",
            },
          },
        ],
      }) as never
    );

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation({ title: "My Existing Title" }),
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

    setupMocksForRender();
    mockRunMultiActionsAgent.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: new Error("LLM call failed"),
    } as never);

    // Should not throw.
    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation(),
      messageId: "any-msg-id",
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });
});

describe("shouldProposeRenameTitle (throttling)", () => {
  it("skips when a pending suggestion exists within cooldown", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Create additional messages at known ranks for the trigger message.
    // The factory creates ranks 0 (user) and 1 (agent). Add a user message at rank 2.
    const triggerMessage = await ConversationFactory.createUserMessageWithRank({
      auth: authenticator,
      workspace,
      conversationId: conversation.id,
      rank: 2,
      content: "trigger",
    });

    // Create a pending suggestion sourced from the rank-0 message.
    const sourceMessage = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        rank: 0,
      },
    });
    await ConversationButlerSuggestionResource.makeNew(authenticator, {
      conversationId: conversation.id,
      sourceMessageId: sourceMessage!.id,
      suggestionType: "rename_title",
      metadata: { suggestedTitle: "Old Suggestion" },
      status: "pending",
    });

    // Set up mocks for high confidence — the LLM would suggest a rename.
    setupMocksForHighConfidence();

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation({
        id: conversation.id,
        sId: conversation.sId,
      }),
      messageId: triggerMessage.sId,
    });

    // Should still have only the original suggestion (throttled).
    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].status).toBe("pending");
  });

  it("auto-dismisses stale pending suggestion and creates new one", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Create a trigger message far away (rank 22, distance > 10 from rank 0).
    const triggerMessage = await ConversationFactory.createUserMessageWithRank({
      auth: authenticator,
      workspace,
      conversationId: conversation.id,
      rank: 22,
      content: "trigger",
    });

    // Create a pending suggestion sourced from the rank-0 message.
    const sourceMessage = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        rank: 0,
      },
    });
    await ConversationButlerSuggestionResource.makeNew(authenticator, {
      conversationId: conversation.id,
      sourceMessageId: sourceMessage!.id,
      suggestionType: "rename_title",
      metadata: { suggestedTitle: "Old Suggestion" },
      status: "pending",
    });

    setupMocksForHighConfidence();

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation({
        id: conversation.id,
        sId: conversation.sId,
      }),
      messageId: triggerMessage.sId,
    });

    // Should have 2 suggestions: old one auto-dismissed, new one pending.
    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
      order: [["createdAt", "ASC"]],
    });
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].status).toBe("dismissed");
    expect(suggestions[1].status).toBe("pending");
    expect(suggestions[1].metadata).toEqual({
      suggestedTitle: "Better Title",
    });
  });

  it("respects cooldown after a dismissed suggestion", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Trigger message at rank 4 (distance 4 from rank 0, within cooldown of 10).
    const triggerMessage = await ConversationFactory.createUserMessageWithRank({
      auth: authenticator,
      workspace,
      conversationId: conversation.id,
      rank: 4,
      content: "trigger",
    });

    // Create a dismissed suggestion sourced from the rank-0 message.
    const sourceMessage = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        rank: 0,
      },
    });
    await ConversationButlerSuggestionResource.makeNew(authenticator, {
      conversationId: conversation.id,
      sourceMessageId: sourceMessage!.id,
      suggestionType: "rename_title",
      metadata: { suggestedTitle: "Dismissed Suggestion" },
      status: "dismissed",
    });

    setupMocksForHighConfidence();

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation({
        id: conversation.id,
        sId: conversation.sId,
      }),
      messageId: triggerMessage.sId,
    });

    // Should still have only the dismissed suggestion (cooldown respected).
    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].status).toBe("dismissed");
  });

  it("allows new suggestion after cooldown expires for dismissed suggestion", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    // Trigger message at rank 20 (distance 20 from rank 0, beyond cooldown of 10).
    const triggerMessage = await ConversationFactory.createUserMessageWithRank({
      auth: authenticator,
      workspace,
      conversationId: conversation.id,
      rank: 20,
      content: "trigger",
    });

    // Create a dismissed suggestion sourced from the rank-0 message.
    const sourceMessage = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        rank: 0,
      },
    });
    await ConversationButlerSuggestionResource.makeNew(authenticator, {
      conversationId: conversation.id,
      sourceMessageId: sourceMessage!.id,
      suggestionType: "rename_title",
      metadata: { suggestedTitle: "Old Dismissed" },
      status: "dismissed",
    });

    setupMocksForHighConfidence();

    await evaluateRenameTitleSuggestion(authenticator, {
      conversation: makeFakeConversation({
        id: conversation.id,
        sId: conversation.sId,
      }),
      messageId: triggerMessage.sId,
    });

    // Should have 2: old dismissed + new pending.
    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
      order: [["createdAt", "ASC"]],
    });
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].status).toBe("dismissed");
    expect(suggestions[1].status).toBe("pending");
    expect(suggestions[1].metadata).toEqual({
      suggestedTitle: "Better Title",
    });
  });
});
