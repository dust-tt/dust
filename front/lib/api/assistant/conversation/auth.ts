import type {
  ConversationType,
  ConversationWithoutContentType,
  WorkspaceType,
} from "@dust-tt/types";

import { Authenticator } from "@app/lib/auth";
import { Conversation } from "@app/lib/models/assistant/conversation";
import { GroupResource } from "@app/lib/resources/group_resource";

// TODO(2024-11-04 flav) `group-id` clean-up.
export function getConversationGroupIdsFromModel(
  owner: WorkspaceType,
  conversation: Conversation
): string[] {
  return conversation.groupIds.map((g) =>
    GroupResource.modelIdToSId({
      id: g,
      workspaceId: owner.id,
    })
  );
}

export function getConversationRequestedGroupIdsFromModel(
  owner: WorkspaceType,
  conversation: Conversation
): string[][] {
  return conversation.requestedGroupIds.map((groups) =>
    groups.map((g) =>
      GroupResource.modelIdToSId({
        id: g,
        workspaceId: owner.id,
      })
    )
  );
}

export function canAccessConversation(
  auth: Authenticator,
  conversation: ConversationWithoutContentType | ConversationType | Conversation
): boolean {
  const owner = auth.getNonNullableWorkspace();

  const requestedGroupIds =
    conversation instanceof Conversation
      ? getConversationRequestedGroupIdsFromModel(owner, conversation)
      : conversation.requestedGroupIds;

  return auth.canRead(
    Authenticator.createResourcePermissionsFromGroupIds(requestedGroupIds)
  );
}
