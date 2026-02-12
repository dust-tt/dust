import { default as config } from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { CoreAPI } from "@app/types/core/core_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export interface SearchProjectConversationsOptions {
  query: string;
  spaceIds: string[];
  topK: number;
}

export interface ConversationSearchResult {
  conversationId: string;
  score: number;
  spaceId: string;
}

export async function searchProjectConversations(
  auth: Authenticator,
  options: SearchProjectConversationsOptions
): Promise<Result<ConversationSearchResult[], DustError<"core_api_error">>> {
  const { query, spaceIds, topK } = options;

  if (spaceIds.length === 0) {
    return new Ok([]);
  }

  const spaces = (await SpaceResource.fetchByIds(auth, spaceIds)).filter(
    (space) => space.canRead(auth)
  );

  if (spaces.length === 0) {
    return new Ok([]);
  }

  const dataSourceViews = await DataSourceViewResource.listBySpaces(
    auth,
    spaces
  );
  const viewBySpaceId = new Map(
    dataSourceViews.map((dsv) => [dsv.space.sId, dsv])
  );

  const validProjects = spaces
    .map((space) => {
      const dsv = viewBySpaceId.get(space.sId);
      return dsv ? { space, dataSourceView: dsv } : null;
    })
    .filter((p) => p !== null);

  if (validProjects.length === 0) {
    return new Ok([]);
  }

  const searches = validProjects.map(({ dataSourceView }) => ({
    projectId: dataSourceView.dataSource.dustAPIProjectId,
    dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
    view_filter: dataSourceView.toViewFilter(),
  }));

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchResult = await coreAPI.bulkSearchDataSources(
    query,
    topK,
    dustManagedCredentials(),
    false,
    searches
  );

  if (searchResult.isErr()) {
    return new Err(new DustError("core_api_error", searchResult.error.message));
  }

  const dataSourceIdToSpaceId = new Map<string, string>();
  for (const { space, dataSourceView } of validProjects) {
    dataSourceIdToSpaceId.set(
      dataSourceView.dataSource.dustAPIDataSourceId,
      space.sId
    );
  }

  const getDocumentMaxScore = (doc: {
    chunks: Array<{ score?: number | null }>;
  }): number => {
    return Math.max(...doc.chunks.map((chunk) => chunk.score ?? 0), 0);
  };

  const sortedDocuments = [...searchResult.value.documents].sort(
    (a, b) => getDocumentMaxScore(b) - getDocumentMaxScore(a)
  );

  const seen = new Set<string>();
  const results: ConversationSearchResult[] = [];

  for (const doc of sortedDocuments) {
    const spaceId = dataSourceIdToSpaceId.get(doc.data_source_id);
    if (!spaceId) {
      continue;
    }

    // O(n*m) acceptable: tags array is small (< 10 elements per document)
    const conversationTag = doc.tags.find((tag) =>
      tag.startsWith("conversation:")
    );
    if (!conversationTag) {
      continue;
    }

    const conversationId = conversationTag.replace("conversation:", "");
    if (seen.has(conversationId)) {
      continue;
    }

    seen.add(conversationId);
    results.push({
      conversationId,
      score: getDocumentMaxScore(doc),
      spaceId,
    });
  }

  return new Ok(results);
}
