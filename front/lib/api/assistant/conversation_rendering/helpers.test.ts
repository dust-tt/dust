import { makeEnableSkillInstructionsMarker } from "@app/lib/api/actions/servers/skill_management/rendering";
import { renderEquippedSkillsUserMessage } from "@app/lib/api/assistant/skills_rendering";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { TextContent } from "@app/types/assistant/generation";
import { isString } from "@app/types/shared/utils/general";
import { describe, expect, it } from "vitest";

import { getSteps, renderUserMessage } from "./helpers";

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

describe("skill rendering helpers", () => {
  it("renders equipped skills as a synthetic user message", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const commitSkill = await SkillFactory.create(authenticator, {
      name: "commit",
      agentFacingDescription: "Create a git commit with a descriptive message.",
    });
    const reviewPrSkill = await SkillFactory.create(authenticator, {
      name: "review-pr",
      agentFacingDescription:
        "Review a pull request for code quality and correctness.",
    });

    const message = renderEquippedSkillsUserMessage([
      commitSkill,
      reviewPrSkill,
    ]);

    expect(message).toEqual({
      role: "user",
      name: "system",
      content: [
        {
          type: "text",
          text: `<dust_system>
The following skills are available for use with the skill_management__enable_skill tool:

- **commit**: Create a git commit with a descriptive message.
- **review-pr**: Review a pull request for code quality and correctness.
</dust_system>`,
        },
      ],
    });
  });

  it("renders enabled skills as user messages", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Test Agent",
        description: "A test agent for skill follow-up rendering",
      }
    );

    const commitSkill = await SkillFactory.create(authenticator, {
      name: "commit",
      instructions: "Create a git commit with a descriptive message.",
    });
    const enabledSkill = SkillFactory.withExtendedSkill(commitSkill);
    const model = getSupportedModelConfig(agentConfig.model);
    if (!model) {
      throw new Error("Expected a supported model configuration.");
    }
    const marker = makeEnableSkillInstructionsMarker(commitSkill.sId);
    if (marker.type !== "resource") {
      throw new Error("Expected a marker resource.");
    }
    const skillId = marker.resource._meta?.["skillId"];
    if (!isString(skillId)) {
      throw new Error("Expected a normalized skill marker id.");
    }
    Object.assign(marker.resource, { skillId });
    delete marker.resource._meta;

    const message = {
      id: 1,
      agentMessageId: 1,
      type: "agent_message",
      sId: "agent_msg_1",
      version: 1,
      rank: 1,
      branchId: null,
      created: Date.now(),
      completedTs: null,
      parentMessageId: "user_msg_1",
      parentAgentMessageId: null,
      status: "succeeded",
      content: null,
      chainOfThought: null,
      error: null,
      visibility: "visible",
      configuration: agentConfig,
      skipToolsValidation: false,
      actions: [
        {
          id: 1,
          sId: "action_1",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          agentMessageId: 1,
          internalMCPServerName: "skill_management",
          toolName: "enable_skill",
          mcpServerId: null,
          functionCallName: "skill_management__enable_skill",
          functionCallId: "toolu_enable_skill",
          params: { skillName: commitSkill.name },
          citationsAllocated: 0,
          status: "succeeded",
          step: 0,
          executionDurationMs: null,
          displayLabels: null,
          generatedFiles: [],
          output: [marker],
          citations: null,
        },
      ],
      contents: [
        {
          step: 0,
          content: {
            type: "function_call",
            value: {
              id: "toolu_enable_skill",
              name: "skill_management__enable_skill",
              arguments: '{"skillName":"commit"}',
            },
          },
        },
      ],
      modelInteractionDurationMs: null,
      richMentions: [],
      completionDurationMs: null,
      reactions: [],
    } satisfies AgentMessageType;

    const steps = getSteps(authenticator, {
      enabledSkillById: new Map([[enabledSkill.sId, enabledSkill]]),
      model,
      message,
      workspaceId: "workspace_123",
      conversationId: "conv_1",
      onMissingAction: "skip",
      renderSkillsAsUserMessages: true,
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].actions).toHaveLength(1);
    expect(steps[0].actions[0].enabledSkillMessages).toEqual([
      {
        role: "user",
        name: "system",
        content: [
          {
            type: "text",
            text:
              "<dust_system>\n<commit>\n" +
              "Create a git commit with a descriptive message.\n" +
              "</commit>\n</dust_system>",
          },
        ],
      },
    ]);
  });
});
