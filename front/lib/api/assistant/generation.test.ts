import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import {
  globalAgentInjectsUserContext,
  globalAgentInjectsWorkspaceContext,
} from "@app/lib/api/assistant/global_agents/prompt_context";
import {
  normalizePrompt,
  systemPromptToText,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type {
  AgentConfigurationType,
  AgentConfigurationWithoutModelType,
} from "@app/types/assistant/agent";
import type { StreamModelInfo } from "@app/types/assistant/agent_run";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

function withoutModel(
  config: AgentConfigurationType
): AgentConfigurationWithoutModelType {
  const { model: _model, ...agentConfiguration } = config;
  return agentConfiguration;
}

function agentLoopModel(
  config: AgentConfigurationType,
  modelConfig: ModelConfigurationType
): StreamModelInfo {
  const { temperature, reasoningEffort, responseFormat, metaData } =
    config.model;
  return {
    endpoint: getTestStreamEndpoint(modelConfig.modelId),
    temperature,
    reasoningEffort,
    responseFormat,
    metaData,
  };
}

function createForkedData(user: NonNullable<UserMessageType["user"]>) {
  return {
    forkedFrom: {
      parentConversationId: "conv_parent",
      parentConversationTitle: "Parent conversation",
      sourceMessageId: "msg_parent_source",
      branchedAt: Date.now(),
      user,
      fileCopyStatus: "done" as const,
    },
  };
}

describe("constructPromptMultiActions - system prompt stability", () => {
  // This test ensures that the system prompt remains stable across multiple calls
  // with the same inputs. This is critical for prompt caching - high-entropy data
  // (timestamps with time precision, unique IDs, etc.) would reduce cache hits.

  let authenticator1: Authenticator;
  let workspace1: WorkspaceType;
  let agentConfig1: AgentConfigurationType;
  let userMessage1: UserMessageType;
  let conversation1: ConversationType;

  let authenticator2: Authenticator;
  let workspace2: WorkspaceType;
  let agentConfig2: AgentConfigurationType;
  let userMessage2: UserMessageType;
  let conversation2: ConversationType;
  let branchingUser1: NonNullable<UserMessageType["user"]>;

  let modelConfig: ModelConfigurationType;

  beforeEach(async () => {
    // Set up first workspace with conversation and user message
    const setup1 = await createResourceTest({ role: "admin" });
    authenticator1 = setup1.authenticator;
    workspace1 = setup1.workspace;

    agentConfig1 = await AgentConfigurationFactory.createTestAgent(
      authenticator1,
      {
        name: "Test Agent",
        description: "A test agent for prompt stability",
      }
    );

    conversation1 = await ConversationFactory.create(authenticator1, {
      agentConfigurationId: agentConfig1.sId,
      messagesCreatedAt: [],
    });

    const { userMessage: um1 } = await ConversationFactory.createUserMessage({
      auth: authenticator1,
      workspace: workspace1,
      conversation: conversation1,
      content: "Hello, this is a test message",
      origin: "web",
    });
    userMessage1 = um1;
    if (!um1.user) {
      throw new Error("Expected test user message to have a user.");
    }
    branchingUser1 = um1.user;

    // Set up second workspace with different conversation
    const setup2 = await createResourceTest({ role: "admin" });
    authenticator2 = setup2.authenticator;
    workspace2 = setup2.workspace;

    agentConfig2 = await AgentConfigurationFactory.createTestAgent(
      authenticator2,
      {
        name: "Test Agent",
        description: "A test agent for prompt stability",
      }
    );

    conversation2 = await ConversationFactory.create(authenticator2, {
      agentConfigurationId: agentConfig2.sId,
      messagesCreatedAt: [],
    });

    const { userMessage: um2 } = await ConversationFactory.createUserMessage({
      auth: authenticator2,
      workspace: workspace2,
      conversation: conversation2,
      content: "Different test message content",
      origin: "web",
    });
    userMessage2 = um2;

    // Use a model that has a stream endpoint.
    modelConfig = getTestStreamEndpoint("gpt-5").modelConfig;
  });

  it("should generate identical system prompts for the same inputs", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    const prompt1 = constructPromptMultiActions(authenticator1, params);
    const prompt2 = constructPromptMultiActions(authenticator1, params);

    expect(prompt1).toEqual(prompt2);
  });

  it("should always include stable extension tool guidance", () => {
    const baseParams = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    const webPrompt = constructPromptMultiActions(authenticator1, baseParams);
    const extensionPrompt = constructPromptMultiActions(authenticator1, {
      ...baseParams,
      userMessage: {
        ...userMessage1,
        context: { ...userMessage1.context, origin: "extension" },
      },
    });

    expect(extensionPrompt).toEqual(webPrompt);
    expect(systemPromptToText(webPrompt)).toContain(
      "When the current user message's `<dust_system>` metadata identifies its source as `extension`"
    );
  });

  it("should generate identical system prompts when only the model changes", () => {
    // Two models whose configs inject no model-specific prompt text: the model
    // identity must not leak into the system prompt.
    const modelInfo = agentLoopModel(
      agentConfig1,
      getTestStreamEndpoint("claude-opus-4-8").modelConfig
    );

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo,
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    const prompt1 = constructPromptMultiActions(authenticator1, params);
    const prompt2 = constructPromptMultiActions(authenticator1, {
      ...params,
      modelInfo: {
        ...modelInfo,
        endpoint: getTestStreamEndpoint("claude-sonnet-5"),
      },
    });

    expect(prompt1).toEqual(prompt2);
  });

  it("should generate identical prompts with different conversation metadata from the same workspace", () => {
    // Same workspace, same agent, but different conversation metadata
    const baseParams = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    // Create two different conversation metadata objects
    const convMetadata1: ConversationWithoutContentType = {
      ...conversation1,
      id: 111,
      sId: "conv-aaa",
      title: "First Conversation",
    };

    const convMetadata2: ConversationWithoutContentType = {
      ...conversation1,
      id: 222,
      sId: "conv-bbb",
      title: "Second Conversation - Different",
      unread: true,
      metadata: { different: "metadata" },
    };

    const prompt1 = constructPromptMultiActions(authenticator1, {
      ...baseParams,
      conversation: convMetadata1,
    });
    const prompt2 = constructPromptMultiActions(authenticator1, {
      ...baseParams,
      conversation: convMetadata2,
    });

    // Both should produce identical prompts since conversation-specific metadata
    // (id, sId, title, timestamps) should NOT be included in the system prompt
    expect(prompt1).toEqual(prompt2);
  });

  it("should generate different prompts for different workspaces", () => {
    // Different workspaces should produce different prompts (workspace name is in the prompt)
    const params1 = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      conversation: conversation1,
    };

    const params2 = {
      userMessage: userMessage2,
      agentConfiguration: withoutModel(agentConfig2),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      conversation: conversation2,
    };

    const prompt1 = constructPromptMultiActions(authenticator1, params1);
    const prompt2 = constructPromptMultiActions(authenticator2, params2);

    // Different workspaces should produce different prompts
    // (workspace name is included in the context section)
    expect(prompt1).not.toEqual(prompt2);

    // Verify the workspace names are actually in the prompts
    const text1 = systemPromptToText(prompt1);
    const text2 = systemPromptToText(prompt2);
    expect(text1).toContain(`workspace: ${workspace1.name}`);
    expect(text2).toContain(`workspace: ${workspace2.name}`);
  });

  it("should return flat context array for regular agents", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    const sections = constructPromptMultiActions(authenticator1, params);

    // Regular agents return a flat SystemPromptContext[] (no structured prompt).
    const { instructions, sharedContext } = normalizePrompt(sections);
    expect(instructions).toHaveLength(0);
    expect(sharedContext.length).toBeGreaterThan(0);
    expect(sharedContext[0].content).toContain("# INSTRUCTIONS");
    expect(sharedContext.every((s) => s.role === "context")).toBe(true);
  });

  it("should return structured prompt with instructions for deep-dive agent", () => {
    const deepDiveConfig = {
      ...agentConfig1,
      sId: GLOBAL_AGENTS_SID.DEEP_DIVE,
      scope: "global" as const,
    };

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(deepDiveConfig),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    const sections = constructPromptMultiActions(authenticator1, params);

    // Deep-dive returns the structured form with instructions separated.
    const { instructions, sharedContext, ephemeralContext } =
      normalizePrompt(sections);
    expect(instructions).toHaveLength(1);
    expect(instructions[0].role).toBe("instruction");
    expect(instructions[0].content).toContain("# INSTRUCTIONS");
    expect(sharedContext.length).toBeGreaterThan(0);
    expect(sharedContext.every((s) => s.role === "context")).toBe(true);
    // Deep-dive has no per-user context (no memories/user profile).
    expect(ephemeralContext).toHaveLength(0);
  });

  it("should keep selected-space-scoped prompt sections out of cached tiers", () => {
    const deepDiveConfig = {
      ...agentConfig1,
      sId: GLOBAL_AGENTS_SID.DEEP_DIVE,
      scope: "global" as const,
    };

    const baseParams = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(deepDiveConfig),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
    };

    const cachedSections = normalizePrompt(
      constructPromptMultiActions(authenticator1, baseParams)
    );
    expect(cachedSections.instructions[0]?.content).toContain("## SKILLS");
    expect(
      cachedSections.sharedContext.some((section) =>
        section.content.trim().startsWith("# TOOLS")
      )
    ).toBe(true);
    expect(
      cachedSections.ephemeralContext.some(
        (section) =>
          section.content.includes("## SKILLS") ||
          section.content.trim().startsWith("# TOOLS")
      )
    ).toBe(false);

    const scopedSections = normalizePrompt(
      constructPromptMultiActions(authenticator1, {
        ...baseParams,
        hasSelectedSpacesOutsideAgentScope: true,
      })
    );
    expect(scopedSections.instructions[0]?.content).not.toContain("## SKILLS");
    expect(
      scopedSections.sharedContext.some((section) =>
        section.content.trim().startsWith("# TOOLS")
      )
    ).toBe(true);
    expect(
      scopedSections.ephemeralContext.some((section) =>
        section.content.includes("## SKILLS")
      )
    ).toBe(true);
    expect(
      scopedSections.ephemeralContext.some((section) =>
        section.content.trim().startsWith("# TOOLS")
      )
    ).toBe(false);
  });

  it("should place workspace context in shared tier and user context in ephemeral tier for sidekick agent", () => {
    const sidekickConfig = {
      ...agentConfig1,
      sId: GLOBAL_AGENTS_SID.SIDEKICK,
      scope: "global" as const,
    };

    const userCtx =
      "<user_context>\n- Job function: Engineering\n- Preferred platforms: Slack\n</user_context>";
    const workspaceCtx =
      "<workspace_context>\n<available_models>\n</available_models>\n</workspace_context>";

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(sidekickConfig),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      userContext: userCtx,
      workspaceContext: workspaceCtx,
    };

    const sections = constructPromptMultiActions(authenticator1, params);

    const { instructions, sharedContext, ephemeralContext } =
      normalizePrompt(sections);
    expect(instructions).toHaveLength(1);
    expect(instructions[0].role).toBe("instruction");
    expect(instructions[0].content).toContain("# INSTRUCTIONS");
    // User/workspace context must NOT be in the cached instructions block.
    expect(instructions[0].content).not.toContain("<user_context>");
    expect(instructions[0].content).not.toContain("<workspace_context>");

    // Workspace context belongs in the shared tier (cached across users).
    const wsSection = sharedContext.find((s) =>
      s.content.includes("<workspace_context>")
    );
    expect(wsSection).toBeDefined();
    expect(wsSection?.content).toContain("<available_models>");

    // User context belongs in the ephemeral tier (per-user).
    const userSection = ephemeralContext.find((s) =>
      s.content.includes("<user_context>")
    );
    expect(userSection).toBeDefined();
    expect(userSection?.content).toContain("Engineering");
  });

  it("should include branch context in flat prompts using user-facing branch wording", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      conversation: {
        ...conversation1,
        forkingData: createForkedData(branchingUser1),
      } satisfies ConversationWithoutContentType,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("# BRANCH CONTEXT");
    expect(text).toContain(
      'This conversation was branched from "Parent conversation".'
    );
    expect(text).toContain(
      "This conversation starts from a summary of the parent conversation at the branch point."
    );
    expect(text).toContain(
      "Available tools and enabled skills from the parent conversation were carried over into this conversation."
    );
    expect(text).toContain(
      "Conversation attachments and tool outputs available at the branch point were also carried over into this conversation."
    );
    expect(text).not.toContain("child conversation");
    expect(text).not.toContain("source message");
  });

  it("should mention the conversation title tool in conversation prompts", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      serverToolsAndInstructions: [
        { serverName: "common_utilities", tools: [] },
      ],
    };

    const conversationText = systemPromptToText(
      constructPromptMultiActions(authenticator1, {
        ...params,
        conversation: conversation1,
      })
    );
    expect(conversationText).toContain(
      "You are in the context of a conversation with the user."
    );
    expect(conversationText).toContain(
      "common_utilities__set_conversation_title"
    );
  });

  it("should inject the formatting prompt by default and drop it when disabled", () => {
    // Use a model that actually carries a formatting prompt (OpenAI models do).
    const modelWithFormatting = getTestStreamEndpoint("gpt-5").modelConfig;
    const { formattingMetaPrompt } = modelWithFormatting;
    if (!formattingMetaPrompt) {
      throw new Error("expected the model to carry a formatting prompt");
    }

    const baseParams = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelWithFormatting),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
    };

    const enabledText = systemPromptToText(
      constructPromptMultiActions(authenticator1, baseParams)
    );
    expect(enabledText).toContain("# RESPONSE FORMAT");
    expect(enabledText).toContain(formattingMetaPrompt);

    const disabledText = systemPromptToText(
      constructPromptMultiActions(authenticator1, {
        ...baseParams,
        disableFormattingPrompt: true,
      })
    );
    expect(disabledText).not.toContain("# RESPONSE FORMAT");
    expect(disabledText).not.toContain(formattingMetaPrompt);
  });

  it("should place branch context in ephemeral tier for structured prompts", () => {
    const deepDiveConfig = {
      ...agentConfig1,
      sId: GLOBAL_AGENTS_SID.DEEP_DIVE,
      scope: "global" as const,
    };

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(deepDiveConfig),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      conversation: {
        ...conversation1,
        forkingData: createForkedData(branchingUser1),
      } satisfies ConversationWithoutContentType,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const { instructions, sharedContext, ephemeralContext } =
      normalizePrompt(sections);

    expect(instructions[0]?.content).not.toContain("# BRANCH CONTEXT");
    expect(
      sharedContext.some((section) =>
        section.content.includes("# BRANCH CONTEXT")
      )
    ).toBe(false);

    const branchSection = ephemeralContext.find((section) =>
      section.content.includes("# BRANCH CONTEXT")
    );
    expect(branchSection).toBeDefined();
    expect(branchSection?.content).toContain(
      'This conversation was branched from "Parent conversation".'
    );
  });

  it("should keep equipped skills out of the system prompt", async () => {
    const equippedSkills = [
      await SkillFactory.create(authenticator1, {
        name: "commit",
        agentFacingDescription:
          "Create a git commit with a descriptive message.",
      }),
    ];

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("## SKILLS");
    expect(text).toContain(
      "Skills are modular capabilities that extend your abilities for specific tasks."
    );
    expect(text).toContain(
      "Enable a skill only when its specialized instructions or tools are needed for the user's request."
    );
    expect(text).toContain(
      "If current capabilities are sufficient or the match is uncertain, do not enable the skill."
    );
    expect(text).toContain("skill_management__enable_skill");
    expect(text).toContain(
      '`<knowledge id="..." title="..." ... />` tags, which point to specific workspace knowledge attached to the skill'
    );
    expect(text).toContain(
      "The tag's `id` can be passed as `nodeId` to the skill's knowledge tools"
    );
    expect(text).toContain(
      "`semantic_search` can search within the node and `list` can show its direct children"
    );
    expect(text).not.toContain(
      "Create a git commit with a descriptive message."
    );
    expect(text).not.toContain(
      "When in doubt about enabling a skill, prefer enabling it"
    );
    expect(text).not.toContain("## AVAILABLE SKILLS");
  });

  it("should point agents to the Computer for uploaded files when Computer is available", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      isNewFileExplorer: true,
      hasSandboxTools: true,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("# FILES");
    expect(text).toContain(
      "You must enable the Computer skill proactively as soon as the user uploads files"
    );
    expect(text).toContain("especially PDFs");
    expect(text).toContain(
      "Connected data references (content nodes with a `nodeId` and `sourceUrl`) appear as `<attachment>` tags"
    );
  });

  it("should point legacy attachment prompts to the Computer when Computer is available", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      isNewFileExplorer: false,
      hasSandboxTools: true,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("# ATTACHMENTS");
    expect(text).toContain(
      "You must enable the Computer skill proactively as soon as the user uploads files"
    );
  });

  it("should not mention the Computer when Computer is unavailable", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [],
      enabledSkills: [],
      equippedSkills: [],
      isNewFileExplorer: true,
      hasSandboxTools: false,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("# FILES");
    expect(text).not.toContain("Computer skill");
    expect(text).toContain(
      "Connected data references (content nodes with a `nodeId` and `sourceUrl`) appear as `<attachment>` tags"
    );
  });

  it("should tell agents the Computer is already active when it is a system skill", async () => {
    const sandbox = await SkillResource.fetchById(authenticator1, "sandbox");
    expect(sandbox).not.toBeNull();
    if (!sandbox) {
      return;
    }

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [sandbox],
      enabledSkills: [],
      equippedSkills: [],
      isNewFileExplorer: true,
      hasSandboxTools: true,
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("The Computer skill is always active for you");
    expect(text).toContain("Do not try to enable it first.");
    expect(text).not.toContain(
      "You must enable the Computer skill proactively"
    );
  });

  it("should keep system skill instructions in the system prompt", async () => {
    const discoverSkills = await SkillResource.fetchById(
      authenticator1,
      "discover_skills"
    );
    expect(discoverSkills).not.toBeNull();
    if (!discoverSkills) {
      return;
    }

    const params = {
      userMessage: userMessage1,
      agentConfiguration: withoutModel(agentConfig1),
      modelInfo: agentLoopModel(agentConfig1, modelConfig),
      hasAvailableActions: true,
      systemSkills: [discoverSkills],
      enabledSkills: [],
      equippedSkills: [],
    };

    const sections = constructPromptMultiActions(authenticator1, params);
    const text = systemPromptToText(sections);

    expect(text).toContain("## SKILLS");
    expect(text).toContain("### SYSTEM SKILLS");
    expect(text).toContain(discoverSkills.instructions);
  });
});

describe("globalAgentInjectsUserContext", () => {
  it("should return true for sidekick agents", () => {
    expect(globalAgentInjectsUserContext(GLOBAL_AGENTS_SID.SIDEKICK)).toBe(
      true
    );
  });

  it("should return false for non-sidekick agents", () => {
    expect(globalAgentInjectsUserContext(GLOBAL_AGENTS_SID.DUST)).toBe(false);
    expect(globalAgentInjectsUserContext(GLOBAL_AGENTS_SID.DEEP_DIVE)).toBe(
      false
    );
    expect(globalAgentInjectsUserContext(GLOBAL_AGENTS_SID.GPT4)).toBe(false);
  });
});

describe("globalAgentInjectsWorkspaceContext", () => {
  it("should return true for sidekick agents", () => {
    expect(globalAgentInjectsWorkspaceContext(GLOBAL_AGENTS_SID.SIDEKICK)).toBe(
      true
    );
  });

  it("should return false for non-sidekick agents", () => {
    expect(globalAgentInjectsWorkspaceContext(GLOBAL_AGENTS_SID.DUST)).toBe(
      false
    );
    expect(
      globalAgentInjectsWorkspaceContext(GLOBAL_AGENTS_SID.DEEP_DIVE)
    ).toBe(false);
  });
});
