import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { Err, Ok } from "@app/types";

export const restoreConversationPlugin = createPlugin({
  manifest: {
    id: "restore-conversation",
    name: "Restore conversations",
    description: "Restore deleted conversations by resetting their visibility",
    resourceTypes: ["workspaces"],
    args: {
      mode: {
        type: "enum",
        label: "Restore Mode (Required)",
        description: "Choose how to restore conversations. Select 'Specific Conversations' to restore by IDs or 'All for User' to restore by email",
        values: [
          { label: "Specific Conversations", value: "specific" },
          { label: "All for User", value: "user" },
        ],
      },
      conversationIds: {
        type: "text",
        label: "Conversation IDs (for 'Specific Conversations' mode)",
        description: "Comma-separated list of conversation sIds. Only fill this when mode is 'Specific Conversations'",
      },
      userEmail: {
        type: "text",
        label: "User Email (for 'All for User' mode)",
        description: "Email address of the user whose conversations to restore. Only fill this when mode is 'All for User'",
      },
    },
  },
  execute: async (auth, _, args) => {
    // Default to 'specific' if mode is not provided
    const mode = args.mode || 'specific';
    
    if (!['specific', 'user'].includes(mode)) {
      return new Err(new Error("Invalid mode selected"));
    }

    if (mode === 'specific') {
      const conversationIds = args.conversationIds?.trim();
      if (!conversationIds) {
        return new Err(new Error("Please provide Conversation IDs when mode is 'Specific Conversations'"));
      }
      
      // Check if user accidentally filled in email field
      if (args.userEmail?.trim()) {
        return new Err(new Error("User Email should be empty when mode is 'Specific Conversations'. Use 'All for User' mode to restore by email."));
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
    } else {
      const userEmail = args.userEmail?.trim();
      if (!userEmail) {
        return new Err(new Error("Please provide User Email when mode is 'All for User'"));
      }
      
      // Check if user accidentally filled in conversation IDs field
      if (args.conversationIds?.trim()) {
        return new Err(new Error("Conversation IDs should be empty when mode is 'All for User'. Use 'Specific Conversations' mode to restore by IDs."));
      }

      const user = await UserResource.fetchByEmail(userEmail);
      if (!user) {
        return new Err(new Error(`User not found with email: ${userEmail}`));
      }

      const workspace = auth.getNonNullableWorkspace();
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const conversations = await ConversationResource.listConversationsForUser(
        userAuth,
        { includeDeleted: true }
      );

      const deletedConversations = conversations.filter(
        (c) => c.visibility === 'deleted'
      );

      if (deletedConversations.length === 0) {
        return new Ok({
          display: "text",
          value: `No deleted conversations found for user ${userEmail}`,
        });
      }

      const restoredConversations = [];
      for (const conversationData of deletedConversations) {
        const conversation = await ConversationResource.fetchById(
          auth,
          conversationData.sId,
          { includeDeleted: true }
        );
        if (conversation) {
          await conversation.updateVisibilityToUnlisted();
          restoredConversations.push(conversation);
        }
      }

      return new Ok({
        display: "text",
        value: `Restored ${restoredConversations.length} conversations for user ${userEmail}`,
      });
    }
  },
});
