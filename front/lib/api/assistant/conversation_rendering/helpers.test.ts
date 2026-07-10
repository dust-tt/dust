import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { renderEquippedSkillsUserMessage } from "@app/lib/api/assistant/skills_rendering";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { TextContent } from "@app/types/assistant/generation";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
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
    const model = getSupportedModelConfig(agentConfig.model);
    assert(model, "Expected a supported model configuration.");

    const outputBlock = makeEnableSkillResultOutput({
      skillId: commitSkill.sId,
      text: `Skill "${commitSkill.name}" has been enabled.`,
    });

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
          output: [outputBlock],
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
      costCredits: null,
      resolvedModel: null,
      modelResolutionMethod: null,
    } satisfies AgentMessageType;

    const steps = await getSteps(authenticator, {
      enabledSkillById: new Map([[commitSkill.sId, commitSkill]]),
      model,
      message,
      workspaceId: "workspace_123",
      conversationId: "conv_1",
      onMissingAction: "skip",
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

describe("vision image rendering in getSteps", () => {
  const buildVisionTest = async (gcsPathOverride?: string) => {
    const { authenticator, conversationsSpace } = await createResourceTest({
      role: "admin",
    });
    const workspaceId = authenticator.getNonNullableWorkspace().sId;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Vision Agent",
        description: "An agent that reads images",
        model: { providerId: "anthropic", modelId: "claude-sonnet-4-6" },
      }
    );
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    const conversationId = conversation.sId;
    const model = getSupportedModelConfig(agentConfig.model);
    if (!model) {
      throw new Error("Expected a supported model configuration.");
    }

    const gcsPath =
      gcsPathOverride ??
      `w/${workspaceId}/conversations/${conversationId}/files/photo.png`;

    const message: AgentMessageType = {
      id: 1,
      agentMessageId: 1,
      type: "agent_message" as const,
      sId: "agent_msg_1",
      version: 1,
      rank: 1,
      branchId: null,
      created: Date.now(),
      completedTs: null,
      parentMessageId: "user_msg_1",
      parentAgentMessageId: null,
      status: "succeeded" as const,
      content: null,
      chainOfThought: null,
      error: null,
      visibility: "visible" as const,
      configuration: agentConfig,
      skipToolsValidation: false,
      actions: [
        {
          id: 1,
          sId: "action_1",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          agentMessageId: 1,
          internalMCPServerName: "files",
          toolName: "cat",
          mcpServerId: null,
          functionCallName: "files__cat",
          functionCallId: "toolu_cat_1",
          params: { path: "conversation/photo.png" },
          citationsAllocated: 0,
          status: "succeeded" as const,
          step: 0,
          executionDurationMs: null,
          displayLabels: null,
          generatedFiles: [],
          citations: null,
          output: (() => {
            const resource = {
              uri: "dust://files/conversation/photo.png",
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.MODEL_VISION_IMAGE,
              text: "" as const,
              filePath: gcsPath,
              imageContentType: "image/png",
            };
            return [{ type: "resource" as const, resource }];
          })(),
        },
      ],
      contents: [
        {
          step: 0,
          content: {
            type: "function_call" as const,
            value: {
              id: "toolu_cat_1",
              name: "files__cat",
              arguments: '{"path":"conversation/photo.png"}',
            },
          },
        },
      ],
      modelInteractionDurationMs: null,
      richMentions: [],
      completionDurationMs: null,
      reactions: [],
      costCredits: null,
      resolvedModel: null,
      modelResolutionMethod: null,
    };

    return { auth: authenticator, message, model, workspaceId, conversationId };
  };

  it("produces an image_url block when the model supports vision", async () => {
    const { auth, message, model, workspaceId, conversationId } =
      await buildVisionTest();

    const steps = await getSteps(auth, {
      model,
      message,
      workspaceId,
      conversationId,
      enabledSkillById: new Map(),
      onMissingAction: "skip",
    });

    expect(steps).toHaveLength(1);
    const result = steps[0].actions[0].result;
    expect(result.role).toBe("function");
    expect(Array.isArray(result.content)).toBe(true);
    if (Array.isArray(result.content)) {
      expect(result.content).toEqual([
        {
          type: "image_url",
          image_url: { url: "https://signed-url.test" },
        },
      ]);
    }
  });

  it("falls back to JSON when the model does not support vision, flattened and without the resource wrapper or mimeType", async () => {
    const { auth, message, model, workspaceId, conversationId } =
      await buildVisionTest();
    const nonVisionModel = { ...model, supportsVision: false };

    const steps = await getSteps(auth, {
      model: nonVisionModel,
      message,
      workspaceId,
      conversationId,
      enabledSkillById: new Map(),
      onMissingAction: "skip",
    });

    const result = steps[0].actions[0].result;
    expect(typeof result.content).toBe("string");
    assert(typeof result.content === "string");

    const parsed = JSON.parse(result.content);
    // Flattened: the resource's own fields directly, no "type"/"resource" wrapper and no
    // mimeType (a pure internal type discriminator the model never reads).
    expect(parsed).toEqual([
      {
        uri: "dust://files/conversation/photo.png",
        text: "",
        filePath: `w/${workspaceId}/conversations/${conversationId}/files/photo.png`,
        imageContentType: "image/png",
      },
    ]);
  });

  it("renders [Image unavailable] when the path does not belong to the conversation", async () => {
    const foreignGcsPath = `w/other-workspace/conversations/other-conv/files/photo.png`;
    const { auth, message, model, workspaceId, conversationId } =
      await buildVisionTest(foreignGcsPath);

    const steps = await getSteps(auth, {
      model,
      message,
      workspaceId,
      conversationId,
      enabledSkillById: new Map(),
      onMissingAction: "skip",
    });

    const result = steps[0].actions[0].result;
    expect(Array.isArray(result.content)).toBe(true);
    if (Array.isArray(result.content)) {
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("Image unavailable"),
      });
    }
  });
});

describe("websearch resource array compaction in getSteps", () => {
  it("flattens every result in a multi-result websearch output, dropping the resource wrapper and mimeType from each", async () => {
    const { authenticator, conversationsSpace } = await createResourceTest({
      role: "admin",
    });
    const workspaceId = authenticator.getNonNullableWorkspace().sId;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Websearch Agent",
        description: "An agent that searches the web",
        model: { providerId: "anthropic", modelId: "claude-sonnet-4-6" },
      }
    );
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    const conversationId = conversation.sId;
    const model = getSupportedModelConfig(agentConfig.model);
    if (!model) {
      throw new Error("Expected a supported model configuration.");
    }

    const websearchResults = [
      {
        uri: "https://www.foxsports.com/soccer/fifa-world-cup/schedule",
        text: "STREAM FIFA WORLD CUP 2026 · GROUP STAGE · Match Day 1. Jun 11 - Jun 17 · Match Day 2. Jun 18 - Jun 23 · Match Day 3. Jun 24 - Jun 27.",
        title: "2026 FIFA World Cup Schedule | FOX Sports",
        reference: "g8q",
      },
      {
        uri: "https://www.france24.com/en/full-coverage/world-cup/fixtures-results/",
        text: "June 11 to July 19, 2026. A total of 104 matches will be played over 39 days. Knockout stage: June 28 to July 19. July 14 and 15.",
        title:
          "World Cup 2026 fixtures and results: full match schedule - France 24",
        reference: "duj",
      },
      {
        uri: "https://www.espn.com/soccer/team/fixtures/_/id/478/france",
        text: "France Fixtures ; September, 2026 · Fri, Sep 25. TUR · FRA · Mon, Sep 28 ; October, 2026 · Fri, Oct 2. FRA · ITA · Mon, Oct 5 ; November, 2026 · Thu, Nov 12. ITA · FRA.",
        title: "France Fixtures - ESPN",
        reference: "cvs",
      },
    ];

    const message: AgentMessageType = {
      id: 1,
      agentMessageId: 1,
      type: "agent_message" as const,
      sId: "agent_msg_1",
      version: 1,
      rank: 1,
      branchId: null,
      created: Date.now(),
      completedTs: null,
      parentMessageId: "user_msg_1",
      parentAgentMessageId: null,
      status: "succeeded" as const,
      content: null,
      chainOfThought: null,
      error: null,
      visibility: "visible" as const,
      configuration: agentConfig,
      skipToolsValidation: false,
      actions: [
        {
          id: 1,
          sId: "action_1",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          agentMessageId: 1,
          internalMCPServerName: "web_search_&_browse",
          toolName: "websearch",
          mcpServerId: null,
          functionCallName: "web_search_browse__websearch",
          functionCallId: "toolu_websearch_1",
          params: { query: "world cup 2026 schedule" },
          citationsAllocated: websearchResults.length,
          status: "succeeded" as const,
          step: 0,
          executionDurationMs: null,
          displayLabels: null,
          generatedFiles: [],
          citations: null,
          output: websearchResults.map((r) => ({
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
              ...r,
            },
          })),
        },
      ],
      contents: [
        {
          step: 0,
          content: {
            type: "function_call" as const,
            value: {
              id: "toolu_websearch_1",
              name: "web_search_browse__websearch",
              arguments: '{"query":"world cup 2026 schedule"}',
            },
          },
        },
      ],
      modelInteractionDurationMs: null,
      richMentions: [],
      completionDurationMs: null,
      reactions: [],
      costCredits: null,
      resolvedModel: null,
    };

    const steps = await getSteps(authenticator, {
      model,
      message,
      workspaceId,
      conversationId,
      enabledSkillById: new Map(),
      onMissingAction: "skip",
    });

    const result = steps[0].actions[0].result;
    expect(typeof result.content).toBe("string");
    assert(typeof result.content === "string");

    const parsed = JSON.parse(result.content);
    // Every result is flattened to its own fields directly, no "type"/"resource" wrapper and
    // no mimeType, for the whole array, not just a single item.
    expect(parsed).toEqual(websearchResults);
  });
});
