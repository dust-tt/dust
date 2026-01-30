import { describe, expect, it } from "vitest";

import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/common_utilities/metadata";
import {
  constructGuidelinesSection,
  constructProjectContextSection,
} from "@app/lib/api/assistant/generation";
import type {
  AgentConfigurationType,
  ConversationWithoutContentType,
  UserMessageType,
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
      kind: "regular",
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
      kind: "regular",
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
