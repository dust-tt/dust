import type { Transaction } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function moveConversationToProject(
  auth: Authenticator,
  {
    conversation,
    spaceId,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    spaceId: string;
    transaction?: Transaction;
  }
): Promise<
  Result<
    void,
    DustError<
      | "internal_error"
      | "unauthorized"
      | "conversation_not_found"
      | "space_not_found"
    >
  >
> {
  if (isProjectConversation(conversation)) {
    return new Err(
      new DustError("internal_error", "Conversation is already in a project")
    );
  }

  const project = await SpaceResource.fetchById(auth, spaceId);
  if (!project || !project.isProject()) {
    return new Err(new DustError("space_not_found", "Space not found"));
  }

  if (!project.isMember(auth)) {
    return new Err(
      new DustError("unauthorized", "User is not a member of the project")
    );
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found")
    );
  }

  await withTransaction(async (t) => {
    // Before moving the conversation, capture the current state:
    // - Current updatedAt timestamp
    // - All participants with their lastReadAt status
    const oldUpdatedAt = conversationResource.updatedAt;
    const participants = await conversationResource.listParticipants(auth);

    // Move the conversation to the project (this will update updatedAt)
    await conversationResource.updateSpaceId(project, t);
    // See front/lib/api/assistant/conversation/mentions.ts updateConversationRequirements for more details
    await conversationResource.updateRequirements([project.id], t);

    // For participants who had already read the conversation (unread = false),
    // mark them as read using markAsReadForAuthUser to preserve their read status.
    // Participants who were already unread should stay unread.
    const workspaceSId = auth.getNonNullableWorkspace().sId;

    for (const participant of participants) {
      // A participant was read if they had a lastReadAt and it was >= oldUpdatedAt
      const wasRead =
        participant.lastReadAt !== null &&
        participant.lastReadAt >= oldUpdatedAt;

      if (wasRead) {
        const participantAuth = await Authenticator.fromUserIdAndWorkspaceId(
          participant.sId,
          workspaceSId
        );
        await ConversationResource.markAsReadForAuthUser(participantAuth, {
          conversation,
          transaction: t,
        });
      }
    }
  }, transaction);

  return new Ok(undefined);
}
