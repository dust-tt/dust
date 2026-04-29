import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      describe: "The sId of the workspace owning the conversation.",
      demandOption: true,
    },
    conversationId: {
      type: "string",
      describe: "The sId of the conversation to scrub.",
      demandOption: true,
    },
  },
  async ({ workspaceId, conversationId, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
      dangerouslyRequestAllGroups: true,
    });

    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId,
      { includeDeleted: true }
    );
    if (!conversation) {
      logger.error(
        { workspaceId, conversationId },
        "Conversation not found in workspace."
      );
      return;
    }

    if (!execute) {
      logger.info(
        { workspaceId, conversationId, title: conversation.title },
        "Would scrub conversation."
      );
      return;
    }

    logger.info(
      { workspaceId, conversationId, title: conversation.title },
      "Scrubbing conversation."
    );

    const result = await destroyConversation(auth, { conversation });
    if (result.isErr()) {
      throw result.error;
    }

    logger.info(
      { workspaceId, conversationId },
      "Conversation scrubbed successfully."
    );
  }
);
