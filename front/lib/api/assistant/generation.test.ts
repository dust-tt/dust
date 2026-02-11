import { beforeEach, describe, expect, it } from "vitest";

import {
  constructProjectContextSection,
  constructPromptMultiActions,
} from "@app/lib/api/assistant/generation";
import {
  normalizePrompt,
  systemPromptToText,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { WorkspaceType } from "@app/types/user";

describe("constructProjectContextSection", () => {
  it("should return null when conversation is undefined", () => {
    const result = constructProjectContextSection(undefined);
    expect(result).toBeNull();
  });

  it("should return null when conversation has no spaceId", () => {
    const conversation: ConversationWithoutContentType = {
      id: 1,
      sId: "conv-123",
      created: 1234567890,
      updated: 1234567890,
      unread: false,
      lastReadMs: 1234567890,
      actionRequired: false,
      hasError: false,
      title: "Test Conversation",
      spaceId: null,
      triggerId: null,
      depth: 0,
      requestedSpaceIds: [],
      metadata: {},
    };

    const result = constructProjectContextSection(conversation);
    expect(result).toBeNull();
  });

  it("should return project context section when conversation has spaceId", () => {
    const conversation: ConversationWithoutContentType = {
      id: 1,
      sId: "conv-123",
      created: 1234567890,
      updated: 1234567890,
      unread: false,
      lastReadMs: 1234567890,
      actionRequired: false,
      hasError: false,
      title: "Test Conversation",
      spaceId: "space-456",
      triggerId: null,
      depth: 0,
      requestedSpaceIds: [],
      metadata: {},
    };

    const result = constructProjectContextSection(conversation);

    expect(result).not.toBeNull();
    expect(result).toEqual(`# PROJECT CONTEXT

This conversation is associated with a project. The project provides:
- Persistent file storage shared across all conversations in this project
- Project metadata (description and URLs) for organizational context
- Semantic search capabilities over project files
- Collaborative context that persists beyond individual conversations

## Using Project Tools

**project_manager**: Use these tools to manage persistent project files, metadata, and conversations
**search_project_context**: Use this tool to semantically search across all project files when you need to:
- Find relevant information within the project
- Locate specific content across multiple files
- Answer questions based on project knowledge

## Project Files vs Conversation Attachments
- **Project files**: Persistent, shared across all conversations in the project, managed via project_manager
- **Conversation attachments**: Scoped to this conversation only, temporary context for the current discussion

When information should be preserved for future conversations or context, add it to project files.
`);
  });
});

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

    // Get a real model config.
    const modelConfigs = getSupportedModelConfigs();
    const gpt4Config = modelConfigs.find(
      (m) => m.providerId === "openai" && m.modelId === "gpt-4-turbo"
    );
    modelConfig = gpt4Config ?? modelConfigs[0];
  });

  it("should generate identical system prompts for the same inputs", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: agentConfig1,
      model: modelConfig,
      hasAvailableActions: true,
      agentsList: null,
      enabledSkills: [],
      equippedSkills: [],
    };

    const prompt1 = constructPromptMultiActions(authenticator1, params);
    const prompt2 = constructPromptMultiActions(authenticator1, params);

    expect(prompt1).toEqual(prompt2);
  });

  it("should generate identical prompts with different conversation metadata from the same workspace", () => {
    // Same workspace, same agent, but different conversation metadata
    const baseParams = {
      userMessage: userMessage1,
      agentConfiguration: agentConfig1,
      model: modelConfig,
      hasAvailableActions: true,
      agentsList: null,
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
      agentConfiguration: agentConfig1,
      model: modelConfig,
      hasAvailableActions: true,
      agentsList: null,
      enabledSkills: [],
      equippedSkills: [],
      conversation: conversation1,
    };

    const params2 = {
      userMessage: userMessage2,
      agentConfiguration: agentConfig2,
      model: modelConfig,
      hasAvailableActions: true,
      agentsList: null,
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
      agentConfiguration: agentConfig1,
      model: modelConfig,
      hasAvailableActions: true,
      agentsList: null,
      enabledSkills: [],
      equippedSkills: [],
    };

    const sections = constructPromptMultiActions(authenticator1, params);

    // Regular agents return a flat SystemPromptContext[] (no tuple).
    const [instructions, context] = normalizePrompt(sections);
    expect(instructions).toHaveLength(0);
    expect(context.length).toBeGreaterThan(0);
    expect(context[0].content).toContain("# INSTRUCTIONS");
    expect(context.every((s) => s.role === "context")).toBe(true);
  });

  it("should return tuple with instructions for deep-dive agent", () => {
    const deepDiveConfig = {
      ...agentConfig1,
      sId: GLOBAL_AGENTS_SID.DEEP_DIVE,
      scope: "global" as const,
    };

    const params = {
      userMessage: userMessage1,
      agentConfiguration: deepDiveConfig,
      model: modelConfig,
      hasAvailableActions: true,
      agentsList: null,
      enabledSkills: [],
      equippedSkills: [],
    };

    const sections = constructPromptMultiActions(authenticator1, params);

    // Deep-dive returns the tuple form [instructions, context].
    const [instructions, context] = normalizePrompt(sections);
    expect(instructions).toHaveLength(1);
    expect(instructions[0].role).toBe("instruction");
    expect(instructions[0].content).toContain("# INSTRUCTIONS");
    expect(context.length).toBeGreaterThan(0);
    expect(context.every((s) => s.role === "context")).toBe(true);
  });
});
