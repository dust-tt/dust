import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  ConversationType,
  ConversationWithoutContentType,
  WorkspaceType,
} from "@app/types";

export function getConversationRequestedGroupIdsFromModel(
  owner: WorkspaceType,
  conversation: ConversationResource
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
  conversation:
    | ConversationWithoutContentType
    | ConversationType
    | ConversationResource
): boolean {
  const owner = auth.getNonNullableWorkspace();

  const requestedGroupIds =
    conversation instanceof ConversationResource
      ? getConversationRequestedGroupIdsFromModel(owner, conversation)
      : conversation.requestedGroupIds;

  return auth.canRead(
    Authenticator.createResourcePermissionsFromGroupIds(requestedGroupIds)
  );
}
