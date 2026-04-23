import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  CONVERSATION_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import type { ConversationSearchDocument } from "@app/types/conversation_search/conversation_search";
import type { Result } from "@app/types/shared/result";

export function buildConversationSearchDocument(
  auth: Authenticator,
  conversation: ConversationResource,
  participants: Array<{
    userId: string;
    actionRequired: boolean;
  }>,
  activeWakeUp?: WakeUpResource | null
): ConversationSearchDocument {
  return {
    conversation_id: conversation.sId,
    created_at: conversation.createdAt.toISOString(),
    has_error: conversation.hasError,
    metadata: conversation.metadata ?? {},
    participants: participants.map(({ userId, actionRequired }) => ({
      action_required: actionRequired,
      user_id: userId,
    })),
    requested_space_ids: conversation.getRequestedSpaceIdsFromModel(),
    title: conversation.title,
    trigger_id: conversation.triggerSId,
    updated_at: conversation.updatedAt.toISOString(),
    visibility: conversation.visibility,
    workspace_id: auth.getNonNullableWorkspace().sId,
    ...(conversation.space?.sId && { space_id: conversation.space.sId }),
    next_wakeup_at: activeWakeUp?.nextFireAt()?.toISOString() ?? null,
  };
}

function makeConversationDocumentId({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${workspaceId}_${conversationId}`;
}

export async function indexConversationDocument(
  document: ConversationSearchDocument
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeConversationDocumentId({
    workspaceId: document.workspace_id,
    conversationId: document.conversation_id,
  });

  return withEs(async (client) => {
    await client.index({
      index: CONVERSATION_SEARCH_ALIAS_NAME,
      id: documentId,
      routing: document.workspace_id,
      document,
    });
  });
}

export async function deleteConversationDocument({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeConversationDocumentId({
    workspaceId,
    conversationId,
  });

  return withEs(async (client) => {
    await client.delete({
      index: CONVERSATION_SEARCH_ALIAS_NAME,
      id: documentId,
      routing: workspaceId,
    });
  });
}
