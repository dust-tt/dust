import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import { analyzeConversationActivity } from "@app/temporal/butler/activities";
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

// Mock getConversation to control conversation shape without full DB setup.
vi.mock("@app/lib/api/assistant/conversation/fetch", () => ({
  getConversation: vi.fn(),
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

const mockGetConversation = vi.mocked(getConversation);
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
    // 4+ entries so the activity doesn't skip for being too short.
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

describe("analyzeConversationActivity", () => {
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

    // Mock getConversation to return a conversation with the real DB id and sId.
    mockGetConversation.mockResolvedValue(
      new Ok(
        makeFakeConversation({ id: conversation.id, sId: conversation.sId })
      )
    );
    setupMocksForHighConfidence();

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: conversation.sId,
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

    mockGetConversation.mockResolvedValue(
      new Ok(makeFakeConversation()) as never
    );
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
            arguments: { confidence: 40, new_title: "Some Title" },
          },
        ],
      }) as never
    );

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: conversation.sId,
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

    mockGetConversation.mockResolvedValue(
      new Ok(makeFakeConversation({ title: "My Existing Title" })) as never
    );
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

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: conversation.sId,
      messageId: message!.sId,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("skips conversations with fewer than 4 content entries", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    // Return a short conversation (only 2 content entries).
    mockGetConversation.mockResolvedValue(
      new Ok(makeFakeConversation({ content: [[], []] })) as never
    );

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: "any-conv-id",
      messageId: "any-msg-id",
    });

    // No LLM call should have been made.
    expect(mockRunMultiActionsAgent).not.toHaveBeenCalled();
    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("skips conversations without a title", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockGetConversation.mockResolvedValue(
      new Ok(
        makeFakeConversation({ title: null, content: [[], [], [], []] })
      ) as never
    );

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: "any-conv-id",
      messageId: "any-msg-id",
    });

    expect(mockRunMultiActionsAgent).not.toHaveBeenCalled();
    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("handles LLM errors gracefully without creating a suggestion", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    mockGetConversation.mockResolvedValue(
      new Ok(makeFakeConversation()) as never
    );
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
    mockRunMultiActionsAgent.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: new Error("LLM call failed"),
    } as never);

    // Should not throw.
    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: "any-conv-id",
      messageId: "any-msg-id",
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });
});
