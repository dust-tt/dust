import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import {
  renderEquippedSkillsUserMessage,
  renderFavoriteSkillsUserMessage,
} from "@app/lib/api/assistant/skills_rendering";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { mockFullAgentMessage } from "@app/tests/utils/conversation_test_factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
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

- \`commit\`: Create a git commit with a descriptive message.
- \`review-pr\`: Review a pull request for code quality and correctness.

Pass \`skillName\` exactly as written between backticks above, character for character: same case, same spacing, same punctuation, same prefixes and suffixes. Copy the name rather than retyping it, and do not adjust it to match how other skills in the list are named. Names are matched exactly, so a modified name will not be found.
</dust_system>`,
        },
      ],
    });
  });

  it("renders favorite skills as a separate non-cacheable user message", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const favoriteSkill = await SkillFactory.create(authenticator, {
      name: "favorite-skill",
      agentFacingDescription: "Use my favorite skill.",
    });

    const message = renderFavoriteSkillsUserMessage([favoriteSkill]);

    expect(message).toEqual({
      role: "user",
      name: "user",
      content: [
        {
          type: "text",
          text: `<dust_system>
The following skills were set as favorites by the user and are also available for use with the skill_management__enable_skill tool:

- \`favorite-skill\`: Use my favorite skill.
</dust_system>`,
        },
      ],
    });
  });

  it("folds user-edited tool inputs into the tool result content", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Test Agent",
        description: "A test agent for editable tool input rendering",
      }
    );
    const model = getSupportedModelConfig(agentConfig.model);
    assert(model, "Expected a supported model configuration.");

    const message = mockFullAgentMessage({
      configuration: agentConfig,
      actions: [
        {
          functionCallName: "gmail__send_mail",
          functionCallId: "toolu_send_mail",
          internalMCPServerName: "gmail",
          toolName: "send_mail",
          params: {
            to: "recipient@example.com",
            subject: "Old subject",
            body: "Old body",
          },
          userEditedInputs: {
            subject: "New subject",
            body: "New body",
          },
          status: "succeeded",
          output: "Email sent.",
        },
      ],
    });

    const steps = await getSteps(authenticator, {
      enabledSkillById: new Map(),
      model,
      message,
      workspaceId: "workspace_123",
      conversationId: "conv_1",
      onMissingAction: "skip",
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].actions).toHaveLength(1);
    expect(steps[0].actions[0].result.content).toBe(
      `The tool was executed with these user-edited input values:\n- body: "New body"\n- subject: "New subject".\nEmail sent.`
    );
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

    const message = mockFullAgentMessage({
      configuration: agentConfig,
      actions: [
        {
          functionCallName: "skill_management__enable_skill",
          functionCallId: "toolu_enable_skill",
          internalMCPServerName: "skill_management",
          toolName: "enable_skill",
          params: { skillName: commitSkill.name },
          status: "succeeded",
          output: [outputBlock],
        },
      ],
    });

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

    const visionResource = {
      uri: "dust://files/conversation/photo.png",
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.MODEL_VISION_IMAGE,
      text: "" as const,
      filePath: gcsPath,
      imageContentType: "image/png",
    };

    const message = mockFullAgentMessage({
      configuration: agentConfig,
      actions: [
        {
          functionCallName: "files__cat",
          functionCallId: "toolu_cat_1",
          internalMCPServerName: "files",
          toolName: "cat",
          params: { path: "conversation/photo.png" },
          status: "succeeded",
          output: [{ type: "resource" as const, resource: visionResource }],
        },
      ],
    });

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
    const { authenticator } = await createResourceTest({ role: "admin" });

    const agentConfig = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Websearch Agent",
        description: "An agent that searches the web",
        model: { providerId: "anthropic", modelId: "claude-sonnet-4-6" },
      }
    );
    const model = getSupportedModelConfig(agentConfig.model);
    assert(model, "Expected a supported model configuration.");

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

    const message = mockFullAgentMessage({
      configuration: agentConfig,
      actions: [
        {
          functionCallName: "web_search_browse__websearch",
          functionCallId: "toolu_websearch_1",
          internalMCPServerName: "web_search_&_browse",
          toolName: "websearch",
          params: { query: "world cup 2026 schedule" },
          citationsAllocated: websearchResults.length,
          status: "succeeded",
          output: websearchResults.map((r) => ({
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.WEBSEARCH_RESULT,
              ...r,
            },
          })),
        },
      ],
    });

    const steps = await getSteps(authenticator, {
      model,
      message,
      workspaceId: "workspace_123",
      conversationId: "conv_1",
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
