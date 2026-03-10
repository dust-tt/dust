import {
  formatConversationForShrinkWrap,
  type ShrinkWrapAgentMessage,
  type ShrinkWrapConversationData,
  type ShrinkWrapFeedback,
  type ShrinkWrapUserMessage,
} from "@app/lib/api/assistant/conversation/shrink_wrap";
import { describe, expect, it } from "vitest";

function makeUserMessage(
  overrides: Partial<ShrinkWrapUserMessage> = {}
): ShrinkWrapUserMessage {
  return {
    type: "user_message",
    sId: "user-msg-1",
    created: 1000,
    content: "Hello agent",
    context: { username: "alice" },
    mentions: [],
    ...overrides,
  };
}

function makeAgentMessage(
  overrides: Partial<ShrinkWrapAgentMessage> = {}
): ShrinkWrapAgentMessage {
  return {
    type: "agent_message",
    sId: "agent-msg-1",
    created: 2000,
    content: "Hello user",
    status: "succeeded",
    configuration: { sId: "agent-config-1", name: "TestAgent" },
    actions: [],
    parentAgentMessageId: null,
    ...overrides,
  };
}

function makeConversation(
  messages: (ShrinkWrapUserMessage | ShrinkWrapAgentMessage)[],
  overrides: Partial<ShrinkWrapConversationData> = {}
): ShrinkWrapConversationData {
  return {
    sId: "conv-1",
    title: "Test Conversation",
    messages,
    ...overrides,
  };
}

describe("formatConversationForShrinkWrap", () => {
  it("renders a basic conversation with user and agent messages", () => {
    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), makeAgentMessage()])
    );

    expect(result).toContain("# conv-1: Test Conversation");
    expect(result).toContain("from user alice");
    expect(result).toContain("Hello agent");
    expect(result).toContain("from agent agent-config-1 (TestAgent)");
    expect(result).toContain("Hello user");
  });

  it("renders feedback after the agent message it belongs to", () => {
    const agentMsg = makeAgentMessage({ sId: "agent-msg-1" });
    const feedbackByMessageId = new Map<string, ShrinkWrapFeedback[]>([
      ["agent-msg-1", [{ thumbDirection: "up", content: "Great answer!" }]],
    ]);

    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), agentMsg]),
      { feedbackByMessageId }
    );

    expect(result).toContain("### User feedback");
    expect(result).toContain("- 👍: Great answer!");
  });

  it("renders multiple feedbacks on the same message", () => {
    const feedbackByMessageId = new Map<string, ShrinkWrapFeedback[]>([
      [
        "agent-msg-1",
        [
          { thumbDirection: "up", content: "Helpful" },
          { thumbDirection: "down", content: "Too verbose" },
        ],
      ],
    ]);

    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), makeAgentMessage()]),
      { feedbackByMessageId }
    );

    expect(result).toContain("- 👍: Helpful");
    expect(result).toContain("- 👎: Too verbose");
  });

  it("renders thumbs without comment when feedback has no content", () => {
    const feedbackByMessageId = new Map<string, ShrinkWrapFeedback[]>([
      ["agent-msg-1", [{ thumbDirection: "down", content: null }]],
    ]);

    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), makeAgentMessage()]),
      { feedbackByMessageId }
    );

    expect(result).toMatch(/- 👎\n/);
    expect(result).not.toContain("- 👎:");
  });

  it("does not render feedback section when no feedback exists", () => {
    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), makeAgentMessage()])
    );

    expect(result).not.toContain("### User feedback");
  });

  it("places feedback only on the correct agent message", () => {
    const agent1 = makeAgentMessage({ sId: "agent-1", created: 2000 });
    const agent2 = makeAgentMessage({ sId: "agent-2", created: 3000 });
    const feedbackByMessageId = new Map<string, ShrinkWrapFeedback[]>([
      ["agent-2", [{ thumbDirection: "up", content: "Good" }]],
    ]);

    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), agent1, agent2]),
      { feedbackByMessageId }
    );

    // Feedback should appear after agent-2's content, not agent-1's.
    const agent1Pos = result.indexOf("## Message 1: agent-1");
    const agent2Pos = result.indexOf("## Message 2: agent-2");
    const feedbackPos = result.indexOf("### User feedback");

    expect(agent1Pos).toBeGreaterThan(-1);
    expect(agent2Pos).toBeGreaterThan(-1);
    expect(feedbackPos).toBeGreaterThan(agent2Pos);
  });

  it("truncates long content per message", () => {
    const longContent = "x".repeat(3000);
    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage({ content: longContent })])
    );

    expect(result).toContain("### Content (truncated)");
    expect(result).not.toContain(longContent);
  });

  it("shows truncation notice when slicing messages", () => {
    const result = formatConversationForShrinkWrap(
      makeConversation([makeUserMessage(), makeAgentMessage()]),
      { fromMessageIndex: 1 }
    );

    expect(result).toContain("_(conversation truncated)_");
    expect(result).not.toContain("from user alice");
    expect(result).toContain("from agent agent-config-1");
  });
});
