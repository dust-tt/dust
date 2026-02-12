import { default as config } from "@app/lib/api/config";
import { fetchProjectDataSourceView } from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function searchProjectConversations(
  auth: Authenticator,
  space: SpaceResource,
  query: string,
  topK: number
): Promise<
  Result<
    ConversationWithoutContentType[],
    DustError<
      "core_api_error" | "data_source_view_not_found" | "data_source_not_found"
    >
  >
> {
  // Fetch the project datasource view
  const dataSourceViewRes = await fetchProjectDataSourceView(auth, space);
  if (dataSourceViewRes.isErr()) {
    return new Err(dataSourceViewRes.error);
  }

  const dataSourceView = dataSourceViewRes.value;
  const dataSource = dataSourceView.dataSource;

  // Perform semantic search using CoreAPI
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = dustManagedCredentials();

  const searchRes = await coreAPI.searchDataSource(
    dataSource.dustAPIProjectId,
    dataSource.dustAPIDataSourceId,
    {
      query: query,
      topK: topK,
      fullText: false, // Use semantic search
      credentials: credentials,
      view_filter: dataSourceView.toViewFilter(),
    }
  );

  if (searchRes.isErr()) {
    return new Err(new DustError("core_api_error", searchRes.error.message));
  }

  // Sort documents by relevance (max chunk score) before extracting conversation IDs
  // Each document has chunks, and each chunk has a score
  const sortedDocuments = [...searchRes.value.documents].sort((a, b) => {
    const maxScoreA = Math.max(...a.chunks.map((chunk) => chunk.score ?? 0), 0);
    const maxScoreB = Math.max(...b.chunks.map((chunk) => chunk.score ?? 0), 0);
    return maxScoreB - maxScoreA; // Descending order (highest score first)
  });

  // Extract conversation IDs from document tags, preserving relevance order
  // Tags format: `conversation:${conversation.sId}`
  const conversationIdsWithOrder: Array<{ id: string; index: number }> = [];
  sortedDocuments.forEach((doc, index) => {
    const conversationTag = doc.tags.find((tag) =>
      tag.startsWith("conversation:")
    );
    if (conversationTag) {
      const conversationId = conversationTag.replace("conversation:", "");
      conversationIdsWithOrder.push({ id: conversationId, index });
    }
  });

  if (conversationIdsWithOrder.length === 0) {
    return new Ok([]);
  }

  // Fetch conversation details without content, preserving order
  const conversationMap = new Map<string, ConversationWithoutContentType>();
  await Promise.all(
    conversationIdsWithOrder.map(async ({ id }) => {
      const c = await ConversationResource.fetchById(auth, id);
      if (c) {
        conversationMap.set(id, c.toJSON());
      }
    })
  );

  // Return conversations in the same order as search results (by relevance)
  const validConversations = conversationIdsWithOrder
    .map(({ id }) => conversationMap.get(id))
    .filter(
      (conv): conv is ConversationWithoutContentType => conv !== undefined
    );

  return new Ok(validConversations);
}
