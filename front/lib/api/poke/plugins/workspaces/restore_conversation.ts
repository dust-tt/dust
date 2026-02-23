import { createPlugin } from "@app/lib/api/poke/types";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { Err, Ok } from "@app/types/shared/result";

export const restoreConversationPlugin = createPlugin({
  manifest: {
    id: "restore-conversation",
    name: "Restore conversations",
    description: "Restore deleted conversations by resetting their visibility",
    resourceTypes: ["workspaces"],
    args: {
      conversationIds: {
        type: "text",
        label: "Conversation IDs",
        description: "Comma separated list of conversation sIds to restore",
      },
    },
  },
  execute: async (auth, _, args) => {
    const conversationIds = args.conversationIds.trim();
    if (!conversationIds) {
      return new Err(new Error("conversationIds is required"));
    }

    const conversationIdsArray = conversationIds
      .split(",")
      .map((id) => id.trim());

    const conversations = await ConversationResource.fetchByIds(
      auth,
      conversationIdsArray,
      { includeDeleted: true }
    );

    const missingConversations = conversationIdsArray.filter(
      (id) => !conversations.some((c) => c.sId === id)
    );

    if (missingConversations.length > 0) {
      return new Err(
        new Error(`Conversations not found: ${missingConversations.join(", ")}`)
      );
    }

    for (const conversation of conversations) {
      await conversation.updateVisibilityToUnlisted();
    }

    return new Ok({
      display: "text",
      value: `Restored ${conversations.length} conversations`,
    });
  },
});
