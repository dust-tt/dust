import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Workspace ID (sId)",
      type: "string" as const,
      demandOption: true,
    },
    userId: {
      alias: "u",
      describe: "User ID (sId)",
      type: "string" as const,
      demandOption: true,
    },
    conversationId: {
      alias: "c",
      describe: "Conversation ID (sId)",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ workspaceId, userId, conversationId, execute }, logger) => {
    if (!execute) {
      logger.info(
        "Dry run mode. Use --execute to run the script with the following parameters:"
      );
      logger.info({ workspaceId, userId, conversationId });
      return;
    }

    logger.info("Debugging conversation accessibility...", {
      workspaceId,
      userId,
      conversationId,
    });

    // Create Authenticator from workspace and user
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      userId,
      workspaceId
    );

    // Fetch the conversation
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );

    if (!conversation) {
      logger.error("Conversation not found", { conversationId });
      return;
    }

    logger.info("Conversation found", {
      conversationId: conversation.sId,
      visibility: conversation.visibility,
      requestedGroupIds:
        conversation.getConversationRequestedGroupIdsFromModel(auth),
    });

    // Check accessibility
    const canAccess = ConversationResource.canAccessConversation(
      auth,
      conversation
    );

    logger.info("Accessibility check result", {
      canAccess,
    });

    if (!canAccess) {
      logger.info("Access denied. Debugging information:");
      logger.info({
        userGroupIds: auth.groups().map((g) => g.sId),
        conversationRequestedGroupIds:
          conversation.getConversationRequestedGroupIdsFromModel(auth),
      });
    } else {
      logger.info("Access granted!");
    }
  }
);
