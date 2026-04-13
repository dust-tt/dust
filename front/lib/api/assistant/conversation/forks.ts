import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type CreateConversationForkErrorCode =
  | "conversation_not_found"
  | "invalid_request_error"
  | "internal_error";

export async function createConversationFork(
  auth: Authenticator,
  {
    conversationId,
    sourceMessageId,
  }: {
    conversationId: string;
    sourceMessageId?: string;
  }
): Promise<
  Result<ConversationType, DustError<CreateConversationForkErrorCode>>
> {
  const parentConversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!parentConversation) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found.")
    );
  }

  const branchedAt = new Date();

  const childConversationId = await withTransaction(async (transaction) => {
    const sourceMessage = await ConversationResource.resolveForkSourceMessage(
      auth,
      {
        conversationId: parentConversation.id,
        sourceMessageId,
        transaction,
      }
    );

    if (sourceMessage.isErr()) {
      return new Err(
        new DustError("invalid_request_error", sourceMessage.error.message)
      );
    }

    const childConversation = await ConversationResource.makeNew(
      auth,
      {
        sId: generateRandomModelSId(),
        title: parentConversation.title,
        visibility: parentConversation.visibility,
        depth: parentConversation.depth + 1,
        triggerId: null,
        spaceId: parentConversation.space?.id ?? null,
        requestedSpaceIds: [...parentConversation.requestedSpaceIds],
        metadata: {},
      },
      parentConversation.space,
      { transaction }
    );

    await ConversationResource.upsertParticipation(auth, {
      conversation: childConversation.toJSON(),
      action: "subscribed",
      user: auth.getNonNullableUser().toJSON(),
      transaction,
      lastReadAt: branchedAt,
    });

    await ConversationForkResource.makeNew(
      auth,
      {
        parentConversation,
        childConversation,
        sourceMessageModelId: sourceMessage.value.id,
        branchedAt,
      },
      { transaction }
    );

    return new Ok(childConversation.sId);
  });

  if (childConversationId.isErr()) {
    return childConversationId;
  }

  const childConversation = await getConversation(
    auth,
    childConversationId.value
  );
  if (childConversation.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        "The forked conversation could not be loaded after creation."
      )
    );
  }

  return childConversation;
}
