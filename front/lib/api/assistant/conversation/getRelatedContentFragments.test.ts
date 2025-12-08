import { describe, expect, it } from "vitest";

import { getRelatedContentFragments } from "@app/lib/api/assistant/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type {
  ContentFragmentType,
  ConversationType,
  UserMessageType,
} from "@app/types";

// Helper function to create a mock content fragment
function createMockContentFragment(
  rank: number,
  title: string = "Test Fragment"
): ContentFragmentType {
  return {
    type: "content_fragment",
    id: 1,
    sId: generateRandomModelSId(),
    created: Date.now(),
    visibility: "visible",
    version: 0,
    rank,
    sourceUrl: null,
    title,
    contentType: "text/plain",
    context: {
      username: "testuser",
      fullName: "Test User",
      email: "test@example.com",
      profilePictureUrl: null,
    },
    contentFragmentId: generateRandomModelSId(),
    contentFragmentVersion: "latest",
    expiredReason: null,
    contentFragmentType: "file",
    fileId: generateRandomModelSId(),
    snippet: null,
    generatedTables: [],
    textUrl: "https://example.com/text",
    textBytes: 100,
  };
}

// Helper function to create a mock user message
function createMockUserMessage(rank: number): UserMessageType {
  return {
    id: 1,
    created: Date.now(),
    type: "user_message",
    sId: generateRandomModelSId(),
    visibility: "visible",
    version: 0,
    rank,
    user: null,
    mentions: [],
    richMentions: [],
    content: "Test message",
    context: {
      username: "testuser",
      timezone: "UTC",
      fullName: null,
      email: null,
      profilePictureUrl: null,
    },
  };
}

// Helper function to create a mock agent message
function createMockAgentMessage(rank: number) {
  return {
    type: "agent_message" as const,
    sId: generateRandomModelSId(),
    version: 0,
    rank,
    created: Date.now(),
    completedTs: null,
    parentMessageId: null,
    parentAgentMessageId: null,
    visibility: "visible" as const,
    status: "succeeded" as const,
    content: "Agent response",
    chainOfThought: null,
    error: null,
    id: 1,
    agentMessageId: 1,
    actions: [],
    configuration: {
      sId: generateRandomModelSId(),
      name: "Test Agent",
    } as any,
    skipToolsValidation: false,
    contents: [],
    parsedContents: {},
    modelInteractionDurationMs: null,
  };
}

// Helper function to create a mock conversation
function createMockConversation(
  content: (UserMessageType[] | ContentFragmentType[] | any[])[]
): ConversationType {
  return {
    id: 1,
    sId: generateRandomModelSId(),
    created: Date.now(),
    updated: Date.now(),
    title: "Test Conversation",
    depth: 0,
    visibility: "unlisted",
    unread: false,
    actionRequired: false,
    hasError: false,
    requestedSpaceIds: [],
    spaceId: null,
    owner: {
      id: 1,
      sId: generateRandomModelSId(),
      name: "Test Workspace",
    } as any,
    content,
  };
}

describe("getRelatedContentFragments", () => {
  it("should return empty array when conversation has no content", () => {
    const conversation = createMockConversation([]);
    const message = createMockUserMessage(0);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toEqual([]);
  });

  it("should return empty array when there are no content fragments", () => {
    const userMessage1 = createMockUserMessage(0);
    const userMessage2 = createMockUserMessage(1);
    const conversation = createMockConversation([
      [userMessage1],
      [userMessage2],
    ]);
    const message = createMockUserMessage(2);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toEqual([]);
  });

  it("should return empty array when all content fragments have rank >= message rank", () => {
    const message = createMockUserMessage(1);
    const cf1 = createMockContentFragment(2, "Fragment 1");
    const cf2 = createMockContentFragment(3, "Fragment 2");
    const conversation = createMockConversation([[message], [cf1], [cf2]]);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toEqual([]);
  });

  it("should return consecutive content fragments preceding the message", () => {
    const cf1 = createMockContentFragment(0, "Fragment 1");
    const cf2 = createMockContentFragment(1, "Fragment 2");
    const cf3 = createMockContentFragment(2, "Fragment 3");
    const conversation = createMockConversation([[cf1], [cf2], [cf3]]);
    const message = createMockUserMessage(3);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toHaveLength(3);
    expect(result[0].rank).toBe(2);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(0);
    expect(result[0].title).toBe("Fragment 3");
    expect(result[1].title).toBe("Fragment 2");
    expect(result[2].title).toBe("Fragment 1");
  });

  it("should stop at the first gap in ranks", () => {
    const cf1 = createMockContentFragment(0, "Fragment 1");
    const cf2 = createMockContentFragment(1, "Fragment 2");
    // Gap: rank 2 is missing
    const cf3 = createMockContentFragment(3, "Fragment 3");
    const conversation = createMockConversation([[cf1], [cf2], [cf3]]);
    const message = createMockUserMessage(4);

    const result = getRelatedContentFragments(conversation, message);

    // Function starts from message rank (4), looks for rank 3 (cf3), finds it and adds it
    // Then looks for rank 2, doesn't find it, stops
    // So it should only return cf3, not cf2 and cf1 (because of the gap)
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(3);
    expect(result[0].title).toBe("Fragment 3");
  });

  it("should return only the latest version when multiple versions exist", () => {
    const cf1v0 = createMockContentFragment(0, "Fragment 1 v0");
    cf1v0.version = 0;
    const cf1v1 = createMockContentFragment(0, "Fragment 1 v1");
    cf1v1.version = 1;
    const cf2 = createMockContentFragment(1, "Fragment 2");
    const conversation = createMockConversation([
      [cf1v0, cf1v1], // Multiple versions - last one should be used
      [cf2],
    ]);
    const message = createMockUserMessage(2);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toHaveLength(2);
    // Should use the latest version (v1) from the versions array
    // Result is sorted by rank descending, so cf2 (rank 1) comes first
    expect(result[0].rank).toBe(1);
    expect(result[0].title).toBe("Fragment 2");
    expect(result[1].rank).toBe(0);
    expect(result[1].version).toBe(1);
    expect(result[1].title).toBe("Fragment 1 v1");
  });

  it("should ignore user messages and agent messages", () => {
    const userMessage = createMockUserMessage(0);
    const agentMessage = createMockAgentMessage(1);
    const cf1 = createMockContentFragment(2, "Fragment 1");
    const cf2 = createMockContentFragment(3, "Fragment 2");
    const conversation = createMockConversation([
      [userMessage],
      [agentMessage],
      [cf1],
      [cf2],
    ]);
    const message = createMockUserMessage(4);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toHaveLength(2);
    expect(result[0].rank).toBe(3);
    expect(result[1].rank).toBe(2);
    expect(result[0].title).toBe("Fragment 2");
    expect(result[1].title).toBe("Fragment 1");
  });

  it("should handle message with rank 0", () => {
    const conversation = createMockConversation([]);
    const message = createMockUserMessage(0);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toEqual([]);
  });

  it("should handle content fragments starting from rank 0", () => {
    const cf1 = createMockContentFragment(0, "Fragment 1");
    const cf2 = createMockContentFragment(1, "Fragment 2");
    const conversation = createMockConversation([[cf1], [cf2]]);
    const message = createMockUserMessage(2);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toHaveLength(2);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(0);
  });

  it("should return empty array when there is a gap immediately before the message", () => {
    const cf1 = createMockContentFragment(0, "Fragment 1");
    // Gap: rank 1 is missing, message is at rank 2
    const conversation = createMockConversation([[cf1]]);
    const message = createMockUserMessage(2);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toEqual([]);
  });

  it("should handle mixed content types correctly", () => {
    const userMessage1 = createMockUserMessage(0);
    const cf1 = createMockContentFragment(1, "Fragment 1");
    const agentMessage = createMockAgentMessage(2);
    const cf2 = createMockContentFragment(3, "Fragment 2");
    const cf3 = createMockContentFragment(4, "Fragment 3");
    const conversation = createMockConversation([
      [userMessage1],
      [cf1],
      [agentMessage],
      [cf2],
      [cf3],
    ]);
    const message = createMockUserMessage(5);

    const result = getRelatedContentFragments(conversation, message);

    // Should only return consecutive fragments: cf3 (rank 4) and cf2 (rank 3)
    // Should stop before cf1 (rank 1) because of the gap at rank 2
    expect(result).toHaveLength(2);
    expect(result[0].rank).toBe(4);
    expect(result[1].rank).toBe(3);
    expect(result[0].title).toBe("Fragment 3");
    expect(result[1].title).toBe("Fragment 2");
  });

  it("should return fragments in descending rank order", () => {
    const cf1 = createMockContentFragment(0, "Fragment 1");
    const cf2 = createMockContentFragment(1, "Fragment 2");
    const cf3 = createMockContentFragment(2, "Fragment 3");
    const conversation = createMockConversation([[cf1], [cf2], [cf3]]);
    const message = createMockUserMessage(3);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toHaveLength(3);
    // Should be in descending order (highest rank first)
    expect(result[0].rank).toBe(2);
    expect(result[1].rank).toBe(1);
    expect(result[2].rank).toBe(0);
  });

  it("should handle a single consecutive content fragment", () => {
    const cf1 = createMockContentFragment(2, "Fragment 1");
    const conversation = createMockConversation([[cf1]]);
    const message = createMockUserMessage(3);

    const result = getRelatedContentFragments(conversation, message);

    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(2);
    expect(result[0].title).toBe("Fragment 1");
  });

  it("should handle non-consecutive fragments with gaps", () => {
    const cf1 = createMockContentFragment(0, "Fragment 1");
    // Gap: rank 1 missing
    const cf2 = createMockContentFragment(2, "Fragment 2");
    // Gap: rank 3 missing
    const cf3 = createMockContentFragment(4, "Fragment 3");
    const conversation = createMockConversation([[cf1], [cf2], [cf3]]);
    const message = createMockUserMessage(5);

    const result = getRelatedContentFragments(conversation, message);

    // Should only return cf3 (rank 4) since there's a gap before it
    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(4);
    expect(result[0].title).toBe("Fragment 3");
  });
});
