import * as fs from "fs";
import * as path from "path";
import { QueryTypes } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConversation } from "@app/lib/api/assistant/conversation";
import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { ConversationType, WorkspaceType } from "@app/types";

// Mock Redis to avoid connection issues in tests
vi.mock(import("../lib/api/redis"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    runOnRedis: vi.fn().mockImplementation((_, fn) =>
      fn({
        zAdd: vi.fn().mockResolvedValue(undefined),
        expire: vi.fn().mockResolvedValue(undefined),
      })
    ),
  };
});

/**
 * Helper to create an onboarding conversation with proper setup
 */
async function createOnboardingConversation(
  auth: Authenticator,
  workspace: WorkspaceType,
  user: UserResource,
  options: {
    createdAt?: Date;
    includeAgentMessage?: boolean;
    includeToolCall?: boolean;
    includeTextContent?: boolean;
  } = {}
): Promise<{
  conversation: ConversationType;
  userMessageId: number;
  agentMessageId?: number;
}> {
  const {
    createdAt = new Date(),
    includeAgentMessage = true,
    includeToolCall = false,
    includeTextContent = true,
  } = options;

  // Create the conversation
  const conversation = await createConversation(auth, {
    title: "Welcome to Dust",
    visibility: "unlisted",
    spaceId: null,
  });

  // Update createdAt if specified
  if (createdAt) {
    await ConversationModel.update(
      { createdAt },
      { where: { id: conversation.id, workspaceId: workspace.id } }
    );
  }

  // Create user message with onboarding_conversation origin
  const userMessageRow = await UserMessageModel.create({
    userId: user.id,
    workspaceId: workspace.id,
    content: "Hello! I just signed up and would like to learn about Dust.",
    userContextUsername: user.username,
    userContextTimezone: "UTC",
    userContextFullName: user.name,
    userContextEmail: user.email,
    userContextProfilePictureUrl: null,
    userContextOrigin: "onboarding_conversation",
    clientSideMCPServerIds: [],
    createdAt,
    updatedAt: createdAt,
  });

  const userMessage = await MessageModel.create({
    sId: generateRandomModelSId(),
    rank: 0,
    conversationId: conversation.id,
    parentId: null,
    userMessageId: userMessageRow.id,
    workspaceId: workspace.id,
    createdAt,
    updatedAt: createdAt,
  });

  let agentMessageId: number | undefined;

  if (includeAgentMessage) {
    // Create agent message
    const agentMessageRow = await AgentMessageModel.create({
      status: "succeeded",
      agentConfigurationId: "dust",
      agentConfigurationVersion: 1,
      workspaceId: workspace.id,
      skipToolsValidation: true,
      createdAt,
      updatedAt: createdAt,
    });

    agentMessageId = agentMessageRow.id;

    await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 1,
      conversationId: conversation.id,
      parentId: userMessage.id,
      agentMessageId: agentMessageRow.id,
      workspaceId: workspace.id,
      createdAt,
      updatedAt: createdAt,
    });

    // Add text content if requested
    if (includeTextContent) {
      await AgentStepContentModel.create({
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content",
        value: {
          type: "text_content",
          value:
            "Welcome to Dust! I'm here to help you get started. Let me show you how to connect your tools.",
        },
      });
    }

    // Add tool call if requested
    if (includeToolCall) {
      const functionCallContent = await AgentStepContentModel.create({
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
        step: 1,
        index: 0,
        version: 0,
        type: "function_call",
        value: {
          type: "function_call",
          value: {
            id: "call_123",
            name: "search_workspace",
            arguments: JSON.stringify({ query: "onboarding" }),
          },
        },
      });

      // Create MCP action for the tool call
      // Use type assertion to bypass strict type checking for test fixtures
      // The actual types are complex union types that aren't needed for this test
      const mcpAction = await (AgentMCPActionModel.create as any)({
        workspaceId: workspace.id,
        agentMessageId: agentMessageRow.id,
        stepContentId: functionCallContent.id,
        mcpServerConfigurationId: "test-mcp-config",
        version: 0,
        status: "succeeded",
        citationsAllocated: 0,
        augmentedInputs: { query: "onboarding" },
        toolConfiguration: { name: "search_workspace" },
        stepContext: {
          citationsCount: 0,
          citationsOffset: 0,
          resumeState: null,
          retrievalTopK: 10,
          websearchResultCount: 5,
        },
        executionDurationMs: 150,
      });

      // Create output for the MCP action
      await AgentMCPActionOutputItemModel.create({
        workspaceId: workspace.id,
        agentMCPActionId: mcpAction.id,
        content: {
          type: "text",
          text: "Found 3 results for onboarding: Getting Started Guide, FAQ, Tutorial",
        },
      });

      // Add another text content after tool call
      await AgentStepContentModel.create({
        agentMessageId: agentMessageRow.id,
        workspaceId: workspace.id,
        step: 2,
        index: 0,
        version: 0,
        type: "text_content",
        value: {
          type: "text_content",
          value:
            "I found some helpful resources! Would you like me to guide you through them?",
        },
      });
    }
  }

  return {
    conversation,
    userMessageId: userMessageRow.id,
    agentMessageId,
  };
}

/**
 * Helper to create a regular (non-onboarding) conversation
 */
async function createRegularConversation(
  auth: Authenticator,
  workspace: WorkspaceType,
  user: UserResource
): Promise<ConversationType> {
  const conversation = await createConversation(auth, {
    title: "Regular Conversation",
    visibility: "unlisted",
    spaceId: null,
  });

  // Create user message with regular "web" origin
  const userMessageRow = await UserMessageModel.create({
    userId: user.id,
    workspaceId: workspace.id,
    content: "This is a regular conversation, not onboarding.",
    userContextUsername: user.username,
    userContextTimezone: "UTC",
    userContextFullName: user.name,
    userContextEmail: user.email,
    userContextProfilePictureUrl: null,
    userContextOrigin: "web",
    clientSideMCPServerIds: [],
  });

  await MessageModel.create({
    sId: generateRandomModelSId(),
    rank: 0,
    conversationId: conversation.id,
    parentId: null,
    userMessageId: userMessageRow.id,
    workspaceId: workspace.id,
  });

  return conversation;
}

describe("export_onboarding_conversations", () => {
  let workspace: WorkspaceType;
  let user: UserResource;
  let auth: Authenticator;
  let conversationIds: string[] = [];

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    user = await UserFactory.basic();

    // Create default groups for the workspace (required for Authenticator)
    await GroupFactory.defaults(workspace);

    await MembershipFactory.associate(workspace, user, { role: "admin" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create default spaces (required for conversations)
    await SpaceFactory.defaults(auth);

    conversationIds = [];
  });

  afterEach(async () => {
    // Clean up conversations
    for (const conversationId of conversationIds) {
      try {
        await destroyConversation(auth, { conversationId });
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  describe("Finding onboarding conversations", () => {
    it("should identify conversations with userContextOrigin='onboarding_conversation'", async () => {
      // Create an onboarding conversation
      const { conversation: onboardingConvo } =
        await createOnboardingConversation(auth, workspace, user);
      conversationIds.push(onboardingConvo.sId);

      // Create a regular conversation
      const regularConvo = await createRegularConversation(
        auth,
        workspace,
        user
      );
      conversationIds.push(regularConvo.sId);

      // Query for onboarding conversations using the same query as the script
      // eslint-disable-next-line dust/no-raw-sql
      const results = await frontSequelize.query<{
        conversationId: number;
        conversationSId: string;
      }>(
        `
        SELECT DISTINCT
          c.id as "conversationId",
          c."sId" as "conversationSId"
        FROM conversations c
        JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
        JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
        WHERE um."userContextOrigin" = 'onboarding_conversation'
          AND c."workspaceId" = :workspaceId
          AND c.visibility != 'deleted'
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { workspaceId: workspace.id },
        }
      );

      expect(results).toHaveLength(1);
      expect(results[0].conversationSId).toBe(onboardingConvo.sId);
    });

    it("should filter conversations by date", async () => {
      const oldDate = new Date("2024-01-01");
      const recentDate = new Date("2024-12-15");
      const cutoffDate = new Date("2024-06-01");

      // Create an old onboarding conversation
      const { conversation: oldConvo } = await createOnboardingConversation(
        auth,
        workspace,
        user,
        { createdAt: oldDate }
      );
      conversationIds.push(oldConvo.sId);

      // Create a recent onboarding conversation
      const { conversation: recentConvo } = await createOnboardingConversation(
        auth,
        workspace,
        user,
        { createdAt: recentDate }
      );
      conversationIds.push(recentConvo.sId);

      // Query with date filter
      // eslint-disable-next-line dust/no-raw-sql
      const results = await frontSequelize.query<{
        conversationSId: string;
      }>(
        `
        SELECT DISTINCT
          c."sId" as "conversationSId"
        FROM conversations c
        JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
        JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
        WHERE um."userContextOrigin" = 'onboarding_conversation'
          AND c."workspaceId" = :workspaceId
          AND c."createdAt" > :afterDate
          AND c.visibility != 'deleted'
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { workspaceId: workspace.id, afterDate: cutoffDate },
        }
      );

      expect(results).toHaveLength(1);
      expect(results[0].conversationSId).toBe(recentConvo.sId);
    });

    it("should not include deleted conversations", async () => {
      // Create an onboarding conversation
      const { conversation: onboardingConvo } =
        await createOnboardingConversation(auth, workspace, user);
      conversationIds.push(onboardingConvo.sId);

      // Mark it as deleted
      await ConversationModel.update(
        { visibility: "deleted" },
        { where: { id: onboardingConvo.id, workspaceId: workspace.id } }
      );

      // Query for onboarding conversations
      // eslint-disable-next-line dust/no-raw-sql
      const results = await frontSequelize.query<{
        conversationSId: string;
      }>(
        `
        SELECT DISTINCT
          c."sId" as "conversationSId"
        FROM conversations c
        JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
        JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
        WHERE um."userContextOrigin" = 'onboarding_conversation'
          AND c."workspaceId" = :workspaceId
          AND c.visibility != 'deleted'
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { workspaceId: workspace.id },
        }
      );

      expect(results).toHaveLength(0);
    });
  });

  describe("Message fetching", () => {
    it("should fetch user messages with onboarding origin", async () => {
      const { conversation } = await createOnboardingConversation(
        auth,
        workspace,
        user
      );
      conversationIds.push(conversation.sId);

      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
          visibility: "visible",
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const userMessages = messages.filter((m) => m.userMessage);
      expect(userMessages).toHaveLength(1);
      expect(userMessages[0].userMessage?.userContextOrigin).toBe(
        "onboarding_conversation"
      );
      expect(userMessages[0].userMessage?.content).toContain("just signed up");
    });

    it("should fetch agent messages with step contents", async () => {
      const { conversation } = await createOnboardingConversation(
        auth,
        workspace,
        user,
        { includeTextContent: true }
      );
      conversationIds.push(conversation.sId);

      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
            include: [
              {
                model: AgentStepContentModel,
                as: "agentStepContents",
                required: false,
              },
            ],
          },
        ],
        order: [["rank", "ASC"]],
      });

      const agentMessages = messages.filter((m) => m.agentMessage);
      expect(agentMessages).toHaveLength(1);
      expect(agentMessages[0].agentMessage?.agentStepContents).toHaveLength(1);
      expect(agentMessages[0].agentMessage?.agentStepContents?.[0].type).toBe(
        "text_content"
      );
    });

    it("should fetch agent messages with tool calls and outputs", async () => {
      const { conversation, agentMessageId } =
        await createOnboardingConversation(auth, workspace, user, {
          includeToolCall: true,
          includeTextContent: true,
        });
      conversationIds.push(conversation.sId);

      // Fetch step contents
      const stepContents = await AgentStepContentModel.findAll({
        where: {
          agentMessageId,
          workspaceId: workspace.id,
        },
        order: [
          ["step", "ASC"],
          ["index", "ASC"],
        ],
      });

      // Should have: text_content (step 0), function_call (step 1), text_content (step 2)
      expect(stepContents).toHaveLength(3);
      expect(stepContents[0].type).toBe("text_content");
      expect(stepContents[1].type).toBe("function_call");
      expect(stepContents[2].type).toBe("text_content");

      // Fetch MCP action for the function call
      const functionCallStep = stepContents.find(
        (sc) => sc.type === "function_call"
      );
      expect(functionCallStep).toBeDefined();

      const mcpAction = await AgentMCPActionModel.findOne({
        where: {
          agentMessageId,
          stepContentId: functionCallStep!.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: AgentMCPActionOutputItemModel,
            as: "outputItems",
            required: false,
          },
        ],
      });

      expect(mcpAction).toBeDefined();
      expect(mcpAction?.status).toBe("succeeded");
      expect(mcpAction?.outputItems).toHaveLength(1);
      expect(
        (mcpAction?.outputItems?.[0].content as { text: string }).text
      ).toContain("Found 3 results");
    });
  });

  describe("Markdown generation helpers", () => {
    it("should format dates correctly", () => {
      // Import the helper functions from the script
      const formatDate = (date: Date): string => {
        return date
          .toISOString()
          .replace("T", " ")
          .replace(/\.\d{3}Z$/, " UTC");
      };

      const testDate = new Date("2024-12-15T10:30:00.000Z");
      expect(formatDate(testDate)).toBe("2024-12-15 10:30:00 UTC");
    });

    it("should format timestamps correctly", () => {
      const formatTimestamp = (date: Date): string => {
        return date
          .toISOString()
          .replace("T", " ")
          .replace(/\.\d{3}Z$/, "");
      };

      const testDate = new Date("2024-12-15T10:30:00.000Z");
      expect(formatTimestamp(testDate)).toBe("2024-12-15 10:30:00");
    });

    it("should format text content items correctly", () => {
      const formatContentItem = (item: {
        type: string;
        value: unknown;
      }): string => {
        switch (item.type) {
          case "text_content":
            return item.value as string;
          case "reasoning":
            return "<details>reasoning</details>";
          case "function_call":
            return "**Tool Call**";
          case "error":
            return "**Error**";
          default:
            return JSON.stringify(item);
        }
      };

      expect(
        formatContentItem({ type: "text_content", value: "Hello world" })
      ).toBe("Hello world");
    });
  });

  describe("Cross-workspace isolation", () => {
    it("should not return conversations from other workspaces", async () => {
      // Create onboarding conversation in first workspace
      const { conversation: convo1 } = await createOnboardingConversation(
        auth,
        workspace,
        user
      );
      conversationIds.push(convo1.sId);

      // Create a second workspace with its own onboarding conversation
      const workspace2 = await WorkspaceFactory.basic();
      const user2 = await UserFactory.basic();
      await GroupFactory.defaults(workspace2);
      await MembershipFactory.associate(workspace2, user2, { role: "admin" });
      const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
        user2.sId,
        workspace2.sId
      );
      await SpaceFactory.defaults(auth2);

      const { conversation: convo2 } = await createOnboardingConversation(
        auth2,
        workspace2,
        user2
      );

      // Query should only return conversations from the first workspace
      // eslint-disable-next-line dust/no-raw-sql
      const results = await frontSequelize.query<{
        conversationSId: string;
        workspaceId: number;
      }>(
        `
        SELECT DISTINCT
          c."sId" as "conversationSId",
          c."workspaceId" as "workspaceId"
        FROM conversations c
        JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
        JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
        WHERE um."userContextOrigin" = 'onboarding_conversation'
          AND c.visibility != 'deleted'
        `,
        {
          type: QueryTypes.SELECT,
        }
      );

      // Should find both conversations
      expect(results).toHaveLength(2);
      const workspaceIds = results.map((r) => r.workspaceId);
      expect(workspaceIds).toContain(workspace.id);
      expect(workspaceIds).toContain(workspace2.id);

      // But when filtering by workspace, should only get one
      // eslint-disable-next-line dust/no-raw-sql
      const filteredResults = await frontSequelize.query<{
        conversationSId: string;
      }>(
        `
        SELECT DISTINCT
          c."sId" as "conversationSId"
        FROM conversations c
        JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
        JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
        WHERE um."userContextOrigin" = 'onboarding_conversation'
          AND c."workspaceId" = :workspaceId
          AND c.visibility != 'deleted'
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { workspaceId: workspace.id },
        }
      );

      expect(filteredResults).toHaveLength(1);
      expect(filteredResults[0].conversationSId).toBe(convo1.sId);

      // Cleanup second workspace conversation
      await destroyConversation(auth2, { conversationId: convo2.sId });
    });
  });

  describe("Edge cases", () => {
    it("should handle conversations with no agent messages", async () => {
      const { conversation } = await createOnboardingConversation(
        auth,
        workspace,
        user,
        { includeAgentMessage: false }
      );
      conversationIds.push(conversation.sId);

      const messages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].userMessage).toBeDefined();
      expect(messages[0].agentMessage).toBeNull();
    });

    it("should handle multiple onboarding conversations in same workspace", async () => {
      const { conversation: convo1 } = await createOnboardingConversation(
        auth,
        workspace,
        user
      );
      conversationIds.push(convo1.sId);

      const { conversation: convo2 } = await createOnboardingConversation(
        auth,
        workspace,
        user
      );
      conversationIds.push(convo2.sId);

      // eslint-disable-next-line dust/no-raw-sql
      const results = await frontSequelize.query<{
        conversationSId: string;
      }>(
        `
        SELECT DISTINCT
          c."sId" as "conversationSId"
        FROM conversations c
        JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
        JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
        WHERE um."userContextOrigin" = 'onboarding_conversation'
          AND c."workspaceId" = :workspaceId
          AND c.visibility != 'deleted'
        `,
        {
          type: QueryTypes.SELECT,
          replacements: { workspaceId: workspace.id },
        }
      );

      expect(results).toHaveLength(2);
      const sIds = results.map((r) => r.conversationSId);
      expect(sIds).toContain(convo1.sId);
      expect(sIds).toContain(convo2.sId);
    });

    it("should handle agent messages with errors", async () => {
      const { conversation, agentMessageId } =
        await createOnboardingConversation(auth, workspace, user, {
          includeTextContent: false,
        });
      conversationIds.push(conversation.sId);

      // Add an error step content
      await AgentStepContentModel.create({
        agentMessageId: agentMessageId!,
        workspaceId: workspace.id,
        step: 0,
        index: 0,
        version: 0,
        type: "error",
        value: {
          type: "error",
          value: {
            code: "tool_execution_error",
            message: "Failed to connect to external service",
            metadata: null,
          },
        },
      });

      // Update agent message status
      await AgentMessageModel.update(
        { status: "failed", errorCode: "tool_execution_error" },
        { where: { id: agentMessageId, workspaceId: workspace.id } }
      );

      const agentMessage = await AgentMessageModel.findOne({
        where: { id: agentMessageId, workspaceId: workspace.id },
        include: [
          {
            model: AgentStepContentModel,
            as: "agentStepContents",
            required: false,
          },
        ],
      });

      expect(agentMessage?.status).toBe("failed");
      expect(agentMessage?.agentStepContents).toHaveLength(1);
      expect(agentMessage?.agentStepContents?.[0].type).toBe("error");
    });

    it("should handle reasoning content", async () => {
      const { conversation, agentMessageId } =
        await createOnboardingConversation(auth, workspace, user, {
          includeTextContent: false,
        });
      conversationIds.push(conversation.sId);

      // Add reasoning content
      await AgentStepContentModel.create({
        agentMessageId: agentMessageId!,
        workspaceId: workspace.id,
        step: 0,
        index: 0,
        version: 0,
        type: "reasoning",
        value: {
          type: "reasoning",
          value: {
            reasoning: "Let me think about how to help this new user...",
            metadata: "chain_of_thought",
            tokens: 50,
            provider: "anthropic",
          },
        },
      });

      const stepContents = await AgentStepContentModel.findAll({
        where: { agentMessageId, workspaceId: workspace.id },
      });

      expect(stepContents).toHaveLength(1);
      expect(stepContents[0].type).toBe("reasoning");
      const value = stepContents[0].value as {
        type: string;
        value: { reasoning: string; tokens: number };
      };
      expect(value.value.reasoning).toContain("think about");
      expect(value.value.tokens).toBe(50);
    });
  });

  describe("File output", () => {
    let testOutputDir: string;

    beforeEach(() => {
      // Create a unique temp directory for each test
      testOutputDir = path.join(
        "/tmp",
        `test-onboarding-export-${Date.now()}-${Math.random().toString(36).substring(7)}`
      );
    });

    afterEach(() => {
      // Clean up the temp directory
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    });

    it("should create output directory if it does not exist", () => {
      expect(fs.existsSync(testOutputDir)).toBe(false);

      // Simulate checking and creating directory (same logic as script)
      const resolvedDir = path.resolve(testOutputDir);
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      expect(fs.existsSync(testOutputDir)).toBe(true);
    });

    it("should not error if directory already exists", () => {
      // Pre-create the directory
      fs.mkdirSync(testOutputDir, { recursive: true });
      expect(fs.existsSync(testOutputDir)).toBe(true);

      // Running the same logic again should not throw
      const resolvedDir = path.resolve(testOutputDir);
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      expect(fs.existsSync(testOutputDir)).toBe(true);
    });

    it("should write markdown files with correct naming", () => {
      // Create the directory first
      fs.mkdirSync(testOutputDir, { recursive: true });

      const conversationSId = "conv_abc123";
      const markdown = "# Test Content\n\nThis is a test markdown file.";
      const filepath = path.join(testOutputDir, `${conversationSId}.md`);

      fs.writeFileSync(filepath, markdown, "utf-8");

      expect(fs.existsSync(filepath)).toBe(true);
      expect(fs.readFileSync(filepath, "utf-8")).toBe(markdown);
    });

    it("should generate correct filename format", () => {
      const conversationSIds = ["conv_abc123", "conv_xyz789", "conv_test001"];

      fs.mkdirSync(testOutputDir, { recursive: true });

      for (const sId of conversationSIds) {
        const filepath = path.join(testOutputDir, `${sId}.md`);
        fs.writeFileSync(filepath, `# ${sId}`, "utf-8");
      }

      const files = fs.readdirSync(testOutputDir);
      expect(files).toHaveLength(3);
      expect(files).toContain("conv_abc123.md");
      expect(files).toContain("conv_xyz789.md");
      expect(files).toContain("conv_test001.md");
    });
  });
});
