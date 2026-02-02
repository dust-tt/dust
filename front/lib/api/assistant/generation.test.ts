import { beforeEach, describe, expect, it } from "vitest";

import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/common_utilities/metadata";
import { createConversation } from "@app/lib/api/assistant/conversation";
import {
  constructGuidelinesSection,
  constructProjectContextSection,
  constructPromptMultiActions,
} from "@app/lib/api/assistant/generation";
import { getSupportedModelConfigs } from "@app/lib/api/models";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type {
  AgentConfigurationType,
  ConversationWithoutContentType,
  ModelConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";

describe("constructGuidelinesSection", () => {
  describe("MENTIONING USERS section with Slack/Teams origin handling", () => {
    const baseAgentConfiguration: Pick<
      AgentConfigurationType,
      "actions" | "name"
    > = {
      actions: [],
      name: "test-agent",
    };

    it("should include mention tools for web origin", () => {
      const userMessage = {
        context: {
          origin: "web" as const,
          timezone: "UTC",
        },
      } as UserMessageType;

      const result = constructGuidelinesSection({
        agentConfiguration: baseAgentConfiguration as AgentConfigurationType,
        userMessage,
      });

      // For web origin, should use the tool-based approach with clear instructions
      expect(result).toContain(
        `Call \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` with a search term`
      );
      expect(result).toContain(
        `Call \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` with the exact id and label`
      );

      // Should include the critical warning
      expect(result).toContain(
        "CRITICAL: You MUST use the tools - DO NOT guess the format"
      );
      expect(result).toContain(
        "Attempting to guess or construct the format manually WILL FAIL"
      );

      // Should explain the format distinction
      expect(result).toContain(
        "Format distinction (for reference only - NEVER construct manually)"
      );
      expect(result).toContain(
        "Agent mentions: `:mention[Name]{sId=agent_id}` (no suffix)"
      );
      expect(result).toContain(
        "User mentions: `:mention_user[Name]{sId=user_id}` (note the `_user` suffix)"
      );

      // Should include common mistakes section
      expect(result).toContain("Common mistakes to AVOID:");
      expect(result).toContain(
        "❌ WRONG: `:mention[John Doe]{sId=user_123}` (missing _user suffix)"
      );

      // Should NOT tell to use simple @username
      expect(result).not.toContain("Use a simple @username to mention users");
    });

    it("should use simple @username for Slack origin", () => {
      for (const origin of ["slack", "teams"] as const) {
        const userMessage = {
          context: {
            origin: origin,
            timezone: "UTC",
          },
        } as UserMessageType;

        const result = constructGuidelinesSection({
          agentConfiguration: baseAgentConfiguration as AgentConfigurationType,
          userMessage,
        });

        // For Slack, should explicitly tell NOT to use the tools
        expect(result).toContain(
          `Do not use the \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` or the \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` tools to mention users.`
        );
        expect(result).toContain(
          "Use a simple @username to mention users in your messages in this conversation."
        );

        // Should NOT contain instructions to use the tools
        expect(result).not.toContain(
          `Use the \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` tool to search for users that are available`
        );
        expect(result).not.toContain(
          `Use the \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` tool to get the markdown directive to use`
        );
      }
    });
  });
});

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

**project_context_management**: Use these tools to manage persistent project files and metadata
**search_project_context**: Use this tool to semantically search across all project files when you need to:
- Find relevant information within the project
- Locate specific content across multiple files
- Answer questions based on project knowledge

## Project Files vs Conversation Attachments
- **Project files**: Persistent, shared across all conversations in the project, managed via project_context_management
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
  let conversation1: ConversationWithoutContentType;

  let authenticator2: Authenticator;
  let workspace2: WorkspaceType;
  let agentConfig2: AgentConfigurationType;
  let userMessage2: UserMessageType;
  let conversation2: ConversationWithoutContentType;

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

    conversation1 = await createConversation(authenticator1, {
      title: "Test Conversation 1",
      visibility: "unlisted",
      spaceId: null,
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

    conversation2 = await createConversation(authenticator2, {
      title: "Test Conversation 2 - Different Title",
      visibility: "unlisted",
      spaceId: null,
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

    expect(prompt1).toBe(prompt2);
  });

  it("should generate identical prompts regardless of call order or timing", () => {
    const params = {
      userMessage: userMessage1,
      agentConfiguration: agentConfig1,
      model: modelConfig,
      hasAvailableActions: false,
      agentsList: null,
      enabledSkills: [],
      equippedSkills: [],
    };

    // Simulate multiple "conversations" being rendered.
    const prompts: string[] = [];
    for (let i = 0; i < 5; i++) {
      prompts.push(constructPromptMultiActions(authenticator1, params));
    }

    // All prompts should be identical.
    const firstPrompt = prompts[0];
    for (const prompt of prompts) {
      expect(prompt).toBe(firstPrompt);
    }
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
    expect(prompt1).toBe(prompt2);
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
    expect(prompt1).not.toBe(prompt2);

    // Verify the workspace names are actually in the prompts
    expect(prompt1).toContain(`workspace: ${workspace1.name}`);
    expect(prompt2).toContain(`workspace: ${workspace2.name}`);
  });
});
