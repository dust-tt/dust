import type { ConversationWithoutContentType, Result } from "@dust-tt/types";
import { ConversationError } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import {
  canAccessConversation,
  getConversationGroupIdsFromModel,
  getConversationRequestedGroupIdsFromModel,
} from "@app/lib/api/assistant/conversation/auth";
import type { Authenticator } from "@app/lib/auth";
import { Conversation } from "@app/lib/models/assistant/conversation";

export async function getConversationWithoutContent(
  auth: Authenticator,
  conversationId: string,
  options?: {
    includeDeleted?: boolean;
    dangerouslySkipPermissionFiltering?: boolean;
  }
): Promise<Result<ConversationWithoutContentType, ConversationError>> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await Conversation.findOne({
    where: {
      sId: conversationId,
      workspaceId: owner.id,
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
    // TODO(2024-11-04 flav) `group-id` clean-up.
    groupIds: getConversationGroupIdsFromModel(owner, conversation),
    requestedGroupIds: getConversationRequestedGroupIdsFromModel(
      owner,
      conversation
    ),
  });
}
