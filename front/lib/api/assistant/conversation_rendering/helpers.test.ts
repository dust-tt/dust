import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { TextContent } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

import { renderUserMessage } from "./helpers";

describe("renderUserMessage", () => {
  async function buildMessage(overrides: Partial<any> = {}) {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Test Agent",
        description: "A test agent for prompt stability",
      }
    );

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    // We only include the fields used by renderUserMessage to keep the test
    // simple. The type used in production has many more fields, but they are
    // not needed here.
    const userMessage = {
      content: "",
      user: {
        sId: "user_123",
        fullName: "John Doe",
        email: "john@example.com",
      },
      ...overrides,
    } as any;

    return {
      userMessage,
      conversation,
    };
  }

  it("replaces :mention[name]{...} with @name", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "Hello :mention[John Doe]{sId=user_123}, how are you?",
      context: {},
    });

    const res = renderUserMessage(conversation, userMessage);

    expect(res.role).toBe("user");
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text).toContain("@John Doe");
    expect(text).not.toContain(":mention[John Doe]{user_123}");
  });

  it("adds Sender metadata with full name, username and email", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "Hello!",
      context: {
        // to be different from the user
        fullName: "John DoeDoe",
        username: "jdoedoe",
        email: "johndoe@example.com",
      },
    });

    const res = renderUserMessage(conversation, userMessage);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    // Should include a dust system block and a Sender line.
    expect(text).toEqual(`<dust_system>
- Sender: John Doe (:mention_user[John Doe]{sId=user_123}) <john@example.com>
- Conversation: ${conversation.sId}
</dust_system>

Hello!`);
  });

  it("uses username as name when fullName is not provided", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "Hello!",
      context: {
        username: "jdoe",
      },
    });

    const res = renderUserMessage(conversation, userMessage);

    expect(res.name).toBe("jdoe");
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;
    expect(text).toEqual(`<dust_system>
- Sender: John Doe (:mention_user[John Doe]{sId=user_123}) <john@example.com>
- Conversation: ${conversation.sId}
</dust_system>

Hello!`);
  });

  it("adds sent at metadata when created is provided (timezone stable via context)", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "Ping",
      created: "2025-01-15T12:34:56.000Z",
      context: { timezone: "UTC" },
    });

    const res = renderUserMessage(conversation, userMessage);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    // We do not assert exact date formatting (locale-dependent). We only check
    // that the line is present and not empty.
    const sentAtLine = text
      .split("\n")
      .find((l) => l.startsWith("- Sent at: "));

    expect(sentAtLine).toBeDefined();
    expect(sentAtLine && sentAtLine.length).toBeGreaterThan(
      "- Sent at: ".length
    );
  });

  it("adds trigger source metadata and previous run when origin is 'triggered'", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "Scheduled report",
      context: {
        origin: "triggered",
        lastTriggerRunAt: "2025-01-10T08:00:00.000Z",
        timezone: "UTC",
      },
    });

    const res = renderUserMessage(conversation, userMessage);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text).toContain("- Source: Scheduled trigger");

    const prevRunLine = text
      .split("\n")
      .find((l) => l.startsWith("- Previous scheduled run: "));

    expect(prevRunLine).toBeDefined();
  });

  it("adds generic source metadata when origin is provided (non-triggered)", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "From email",
      context: {
        origin: "email",
      },
    });

    const res = renderUserMessage(conversation, userMessage);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    expect(text).toContain("- Source: email");
  });

  it("includes only conversation metadata when no user metadata is available", async () => {
    const { conversation, userMessage } = await buildMessage({
      content: "Just text",
      context: {},
      user: null,
    });

    const res = renderUserMessage(conversation, userMessage);
    expect(res.content[0].type).toBe("text");
    const text = (res.content[0] as TextContent).text;

    // Should still include the conversation sId even without user info
    expect(text).toEqual(`<dust_system>
- Conversation: ${conversation.sId}
</dust_system>

Just text`);
  });
});
