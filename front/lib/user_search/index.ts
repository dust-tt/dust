import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { USER_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import type { UserSearchDocument } from "@app/types/user_search/user_search";

/**
 * Generate unique document ID for a user in a workspace.
 */
function makeUserDocumentId({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): string {
  return `${workspaceId}_${userId}`;
}

/**
 * Store or update a user document in Elasticsearch.
 * Uses upsert semantics - creates if doesn't exist, updates if it does.
 */
export async function indexUserDocument(
  document: UserSearchDocument
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeUserDocumentId({
    workspaceId: document.workspace_id,
    userId: document.user_id,
  });

  return withEs(async (client) => {
    await client.index({
      index: USER_SEARCH_ALIAS_NAME,
      id: documentId,
      body: document,
    });
  });
}

/**
 * Delete a user document from Elasticsearch.
 */
export async function deleteUserDocument({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeUserDocumentId({ workspaceId, userId });

  return withEs(async (client) => {
    await client.delete({
      index: USER_SEARCH_ALIAS_NAME,
      id: documentId,
    });
  });
}
