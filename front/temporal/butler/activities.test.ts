import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { ConversationButlerSuggestionModel } from "@app/lib/resources/storage/models/conversation_butler_suggestion";
import { analyzeConversationActivity } from "@app/temporal/butler/activities";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock getConversation to control conversation shape without full DB setup.
vi.mock("@app/lib/api/assistant/conversation/fetch", () => ({
  getConversation: vi.fn(),
}));

// Mock the downstream function so we only test the activity's own logic.
vi.mock("@app/lib/butler/suggest_rename_title", () => ({
  evaluateRenameTitleSuggestion: vi.fn(),
}));

const mockGetConversation = vi.mocked(getConversation);

// Use clearAllMocks (not resetAllMocks) to preserve global mock implementations from vite.setup.ts.
beforeEach(() => {
  vi.clearAllMocks();
});

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

describe("analyzeConversationActivity", () => {
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

    const suggestions = await ConversationButlerSuggestionModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(suggestions).toHaveLength(0);
  });
});
