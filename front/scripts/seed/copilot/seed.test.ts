import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type {
  AgentAsset,
  ConversationAsset,
  FeedbackAsset,
  SeedContext,
  SuggestionAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedAgentSuggestions,
  seedConversations,
  seedFeedbacks,
  seedUsers,
} from "@app/scripts/seed/factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";

interface Assets {
  agents: AgentAsset[];
  users: UserAsset[];
  conversations: ConversationAsset[];
  feedbacks: FeedbackAsset[];
  suggestions: SuggestionAsset[];
}

// Load assets from JSON files (same as seed.ts)
function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const agents = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "agents.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "users.json"), "utf-8")
  );
  const conversations = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "conversations.json"), "utf-8")
  );
  const feedbacks = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "feedbacks.json"), "utf-8")
  );
  const suggestions = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "suggestions.json"), "utf-8")
  );
  return { agents, users, conversations, feedbacks, suggestions };
}

describe("copilot seed script integration test", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;

  const assets = loadAssets();

  beforeEach(async () => {
    const testResources = await createResourceTest({ role: "admin" });
    workspace = testResources.workspace;
    user = testResources.user;
    authenticator = testResources.authenticator;
  });

  it("should run the full seed and create all expected resources", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    // 1. Create additional users
    const additionalUsers = await seedUsers(ctx, assets.users);
    expect(additionalUsers.size).toBe(2);

    // Verify users are members of the workspace
    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
    });
    const userEmails = memberships.map((m) => m.user?.email);
    expect(userEmails).toContain("john.doe@example.com");
    expect(userEmails).toContain("amigo@example.com");

    // 2. Create agents
    const createdAgents = await seedAgents(ctx, assets.agents, {
      additionalEditors: [...additionalUsers.values()],
    });
    expect(createdAgents.size).toBe(3);

    const techNewsAgent = createdAgents.get("TechNewsDigest");
    const sharedDocAgent = createdAgents.get("SharedDocumentationWriter");
    const meteoAgent = createdAgents.get("MeteoWithSuggestions");
    expect(techNewsAgent).toBeDefined();
    expect(sharedDocAgent).toBeDefined();
    expect(meteoAgent).toBeDefined();

    // 3. Create agent suggestions for MeteoWithSuggestions
    await seedAgentSuggestions(ctx, assets.suggestions, {
      agents: createdAgents,
    });

    // 4. Create conversations
    await seedConversations(ctx, assets.conversations, {
      agents: createdAgents,
      placeholders: {
        __TECH_NEWS_AGENT_SID__: techNewsAgent?.sId ?? "",
        __METEO_AGENT_SID__: meteoAgent?.sId ?? "",
      },
      additionalUsers,
    });

    // Verify conversations were created
    for (const convAsset of assets.conversations) {
      const conversation = await ConversationResource.fetchById(
        authenticator,
        convAsset.sId
      );
      expect(conversation).toBeDefined();
      expect(conversation?.title).toBe(convAsset.title);

      // Verify messages exist
      const { messages } = await conversation!.fetchMessagesForPage(
        authenticator,
        { limit: 100 }
      );
      // Messages are returned in DESC order, sort by rank ASC for assertions
      const sortedMessages = messages.toSorted((a, b) => a.rank - b.rank);
      expect(sortedMessages.length).toBe(convAsset.exchanges.length * 2);

      // Verify user message content
      const userMessageRow = sortedMessages[0];
      expect(userMessageRow.userMessage?.content).toBeDefined();

      // Verify agent message and step content
      const agentMessageRow = sortedMessages[1];
      expect(agentMessageRow.agentMessage?.status).toBe("succeeded");

      const stepContents = await AgentStepContentResource.fetchByAgentMessages(
        authenticator,
        { agentMessageIds: [agentMessageRow.agentMessage!.id] }
      );
      expect(stepContents.length).toBeGreaterThan(0);
    }

    // Verify first conversation has 4 messages (2 exchanges)
    const firstConv = await ConversationResource.fetchById(
      authenticator,
      "CopilotConv01"
    );
    const { messages: firstConvMessages } =
      await firstConv!.fetchMessagesForPage(authenticator, { limit: 100 });
    expect(firstConvMessages.length).toBe(4);

    // Verify suggestions were created for MeteoWithSuggestions
    const meteoSuggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        authenticator,
        meteoAgent!.sId,
        { limit: 100 }
      );
    expect(meteoSuggestions.length).toBe(6);

    // Verify suggestion kinds
    const suggestionKinds = meteoSuggestions.map((s) => s.toJSON().kind);
    expect(suggestionKinds).toContain("tools");
    expect(suggestionKinds).toContain("model");
    expect(suggestionKinds).toContain("skills");
    expect(suggestionKinds.filter((k) => k === "instructions").length).toBe(2);
    expect(suggestionKinds).toContain("sub_agent");

    // 5. Create feedbacks
    await seedFeedbacks(ctx, assets.feedbacks);

    // Verify feedbacks were created
    const feedbacks = await AgentMessageFeedbackResource.model.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(feedbacks).toHaveLength(2);

    // Verify one feedback has content and one doesn't
    const feedbackWithContent = feedbacks.find((f) => f.content !== null);
    const feedbackWithoutContent = feedbacks.find((f) => f.content === null);
    expect(feedbackWithContent).toBeDefined();
    expect(feedbackWithoutContent).toBeDefined();
    expect(feedbackWithContent?.thumbDirection).toBe("down");
    expect(feedbackWithoutContent?.thumbDirection).toBe("down");

    // Verify idempotency - running again should not create duplicates
    await seedUsers(ctx, assets.users);
    await seedAgents(ctx, assets.agents, {
      additionalEditors: [...additionalUsers.values()],
    });

    for (const convAsset of assets.conversations) {
      const conversation = await ConversationResource.fetchById(
        authenticator,
        convAsset.sId
      );
      expect(conversation).toBeDefined();
    }
  });
});
