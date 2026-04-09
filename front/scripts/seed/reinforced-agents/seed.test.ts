import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories";
import { seedReinforcement } from "@app/scripts/seed/reinforced-agents/seedReinforcedAgents";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("reinforcement seed script integration test", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;

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

    await seedReinforcement(ctx, { skipAnalytics: true });

    // Verify all 5 IT helpdesk conversations + 3 Dust conversations
    const conversationIds = [
      { sId: "RAConv01", title: "Laptop won't turn on", messageCount: 4 },
      { sId: "RAConv02", title: "Can't access Slack", messageCount: 2 },
      { sId: "RAConv03", title: "VPN keeps disconnecting", messageCount: 2 },
      {
        sId: "RAConv04",
        title: "Locked out of Google account",
        messageCount: 6,
      },
      { sId: "RAConv05", title: "Password reset", messageCount: 2 },
      {
        sId: "RADustConv01",
        title: "Analyse a haiku about spring",
        messageCount: 2,
      },
      {
        sId: "RADustConv02",
        title: "Analyse a haiku about the moon",
        messageCount: 2,
      },
      {
        sId: "RADustConv03",
        title: "Analyse a haiku about a frog",
        messageCount: 4,
      },
    ];

    for (const { sId, title, messageCount } of conversationIds) {
      const conversation = await ConversationResource.fetchById(
        authenticator,
        sId,
        {
          dangerouslySkipPermissionFiltering: true,
        }
      );
      expect(conversation).toBeDefined();
      expect(conversation?.title).toBe(title);

      const { messages } = await conversation!.fetchMessagesForPage(
        authenticator,
        { limit: 100 }
      );
      expect(messages.length).toBe(messageCount);
    }

    // Verify feedbacks: 3 IT thumbs down + 1 IT thumbs up + 1 Dust thumbs down = 4 down, 1 up
    const allFeedbacks = (
      await Promise.all(
        conversationIds.map(async ({ sId }) => {
          const conv = await ConversationResource.fetchById(
            authenticator,
            sId,
            {
              dangerouslySkipPermissionFiltering: true,
            }
          );
          return conv
            ? AgentMessageFeedbackResource.listByConversationModelId(
                authenticator,
                conv.id
              )
            : [];
        })
      )
    ).flat();
    expect(allFeedbacks).toHaveLength(5);

    const thumbsDown = allFeedbacks.filter((f) => f.thumbDirection === "down");
    const thumbsUp = allFeedbacks.filter((f) => f.thumbDirection === "up");
    expect(thumbsDown).toHaveLength(4);
    expect(thumbsUp).toHaveLength(1);

    const feedbacksWithContent = allFeedbacks.filter((f) => f.content !== null);
    expect(feedbacksWithContent).toHaveLength(4);

    // Verify idempotency
    await seedReinforcement(ctx, { skipAnalytics: true });

    for (const { sId } of conversationIds) {
      const conversation = await ConversationResource.fetchById(
        authenticator,
        sId,
        {
          dangerouslySkipPermissionFiltering: true,
        }
      );
      expect(conversation).toBeDefined();
    }
  });
});
