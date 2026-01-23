import { createPlugin } from "@app/lib/api/poke/types";
import { ConversationParticipantModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { Err, Ok } from "@app/types";

export const softDeleteConversationPlugin = createPlugin({
  manifest: {
    id: "soft-delete-conversation",
    name: "Soft Delete Conversation",
    description:
      "Soft delete a conversation by removing all participants first, then marking it as deleted",
    resourceTypes: ["workspaces"],
    warning:
      "This will remove all participants from the conversation and mark it as deleted. The conversation can be restored later.",
    args: {
      conversationId: {
        type: "string",
        label: "Conversation ID",
        description: "The sId of the conversation to soft delete",
        required: true,
      },
    },
  },
  execute: async (auth, _, args) => {
    const conversationId = args.conversationId.trim();
    if (!conversationId) {
      return new Err(new Error("conversationId is required"));
    }

    // Fetch conversation with includeDeleted to check current state.
    const conversations = await ConversationResource.fetchByIds(
      auth,
      [conversationId],
      { includeDeleted: true }
    );

    if (conversations.length === 0) {
      return new Err(new Error(`Conversation not found: ${conversationId}`));
    }

    const conversation = conversations[0];

    // Check if conversation is already deleted.
    if (conversation.visibility === "deleted") {
      return new Err(
        new Error(`Conversation ${conversationId} is already deleted.`)
      );
    }

    // Fetch all participants with their user details.
    const participants = await conversation.listParticipants(auth);

    // Extract emails before removing participants.
    const participantEmails = participants.map((p) => p.email);

    // Remove all participants.
    const destroyedCount = await ConversationParticipantModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId: conversation.id,
      },
    });

    // Soft delete the conversation.
    await conversation.updateVisibilityToDeleted();

    // Format output with participant emails.
    const emailList = participantEmails.join("\n  - ");

    return new Ok({
      display: "text",
      value: `Conversation ${conversationId} soft-deleted successfully.

Removed ${destroyedCount} participant${destroyedCount !== 1 ? "s" : ""}:
  - ${emailList}

The conversation can be restored using the restore-conversation plugin.`,
    });
  },
});
