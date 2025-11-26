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
 * Update an existing user document with partial data.
 */
export async function updateUserDocument(
  workspaceId: string,
  userId: string,
  partialUpdate: Partial<UserSearchDocument>
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeUserDocumentId({ workspaceId, userId });

  return withEs(async (client) => {
    await client.update({
      index: USER_SEARCH_ALIAS_NAME,
      id: documentId,
      body: {
        doc: partialUpdate,
      },
    });
  });
}

/**
 * Delete a user document from Elasticsearch.
 */
export async function deleteUserDocument(
  workspaceId: string,
  userId: string
): Promise<Result<void, ElasticsearchError>> {
  const documentId = makeUserDocumentId({ workspaceId, userId });

  return withEs(async (client) => {
    await client.delete({
      index: USER_SEARCH_ALIAS_NAME,
      id: documentId,
    });
  });
}

/**
 * Bulk index user documents for batch operations.
 */
export async function bulkIndexUserDocuments(
  documents: UserSearchDocument[]
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const body = documents.flatMap((doc) => {
      const documentId = makeUserDocumentId({
        workspaceId: doc.workspace_id,
        userId: doc.user_id,
      });

      return [
        { index: { _index: USER_SEARCH_ALIAS_NAME, _id: documentId } },
        doc,
      ];
    });

    await client.bulk({
      body,
      refresh: false, // Don't force refresh for performance
    });
  });
}
