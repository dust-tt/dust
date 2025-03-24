import { Authenticator } from "@app/lib/auth";
import { Conversation } from "@app/lib/models/assistant/conversation";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  ConversationType,
  ConversationWithoutContentType,
  WorkspaceType,
} from "@app/types";

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
