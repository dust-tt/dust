import { Op } from "sequelize";

import {
  canAccessConversation,
  getConversationRequestedGroupIdsFromModel,
} from "@app/lib/api/assistant/conversation/auth";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationWithoutContentType, Result } from "@app/types";
import { ConversationError } from "@app/types";
import { Err, Ok } from "@app/types";

export async function getConversationWithoutContent(
  auth: Authenticator,
  conversationId: string,
  options?: {
    includeDeleted?: boolean;
    dangerouslySkipPermissionFiltering?: boolean;
  }
): Promise<Result<ConversationWithoutContentType, ConversationError>> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchOne(auth, {
    where: {
      sId: conversationId,
      ...(options?.includeDeleted
        ? {}
        : { visibility: { [Op.ne]: "deleted" } }),
    },
  });

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  if (
    !options?.dangerouslySkipPermissionFiltering &&
    !canAccessConversation(auth, conversation)
  ) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  return new Ok({
    id: conversation.id,
    created: conversation.createdAt.getTime(),
    sId: conversation.sId,
    owner,
    title: conversation.title,
    visibility: conversation.visibility,
    requestedGroupIds: getConversationRequestedGroupIdsFromModel(
      owner,
      conversation
    ),
    // TODO(2025-01-15) `groupId` clean-up. Remove once Chrome extension uses optional.
    groupIds: [],
  });
}
