import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import { analyzeConversationActivity } from "@app/temporal/butler/activities";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock getConversation to control conversation shape without full DB setup.
vi.mock("@app/lib/api/assistant/conversation/fetch", () => ({
  getConversation: vi.fn(),
}));

// Mock the downstream function so we only test the activity's own logic.
vi.mock("@app/lib/butler/analyze_conversation", () => ({
  analyzeConversation: vi.fn(),
}));

const mockGetConversation = vi.mocked(getConversation);

// Use clearAllMocks (not resetAllMocks) to preserve global mock implementations from vite.setup.ts.
beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeConversationActivity", () => {
  it("skips conversations with fewer than 4 content entries", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    // Factory returns content: [] (length 0), which is < 4.
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    mockGetConversation.mockResolvedValue(new Ok(conversation) as never);

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: conversation.sId,
      messageId: "any-msg-id",
      passIndex: 0,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });

  it("skips conversations without a title", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date(), new Date()],
    });

    // Override title to null and content to pass the length check.
    mockGetConversation.mockResolvedValue(
      new Ok({
        ...conversation,
        title: null,
        content: [[], [], [], []],
      }) as never
    );

    await analyzeConversationActivity({
      authType: authenticator.toJSON(),
      conversationId: conversation.sId,
      messageId: "any-msg-id",
      passIndex: 0,
    });

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });
});
