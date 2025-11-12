import * as t from "io-ts";
import _ from "lodash";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { TrackerMaintainedScopeType } from "@app/lib/resources/tracker_resource";
import logger from "@app/logger/logger";
import type { APIError, Result } from "@app/types";
import { CoreAPI, dustManagedCredentials, Err, Ok } from "@app/types";

export async function callDocTrackerRetrievalAction(
  auth: Authenticator,
  {
    inputText,
    targetDocumentTokens,
    topK,
    maintainedScope,
    parentsInMap,
  }: {
    inputText: string;
    targetDocumentTokens: number;
    topK: number;
    maintainedScope: TrackerMaintainedScopeType;
    parentsInMap: Record<string, string[] | null>;
  }
): Promise<
  Result<
    {
      result: t.TypeOf<typeof DocTrackerRetrievalActionValueSchema>;
      runId: string | null;
    },
    APIError
  >
> {
  if (!maintainedScope.length) {
    return new Ok({
      result: [],
      runId: null,
    });
  }

  if (
    _.uniqBy(maintainedScope, "dataSourceId").length !== maintainedScope.length
  ) {
    throw new Error("Duplicate data source ids in maintained scope");
  }

  // Fetch all data source views.
  const dataSourceViewIds = maintainedScope.map(
    (view) => view.dataSourceViewId
  );
  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    dataSourceViewIds
  );

  if (dataSourceViews.length !== maintainedScope.length) {
    return new Err({
      type: "internal_server_error",
      message: `Expected ${maintainedScope.length} data source views, got ${dataSourceViews.length}`,
    });
  }

  // Build search parameters for each data source.
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const credentials = dustManagedCredentials();

  const searches = dataSourceViews.map((view) => {
    const dataSource = view.dataSource;
    const dustAPIDataSourceId = dataSource.dustAPIDataSourceId;

    // Get parents filter for this data source if available.
    const parentsFilter = parentsInMap[dustAPIDataSourceId] ?? null;

    return {
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dustAPIDataSourceId,
      filter: {
        tags: {
          in: ["__DUST_TRACKED"],
          not: null,
        },
        parents: parentsFilter
          ? {
              in: parentsFilter,
              not: null,
            }
          : {
              in: null,
              not: null,
            },
        timestamp: null,
      },
      view_filter: view.toViewFilter(),
    };
  });

  // Perform the search across all data sources.
  const searchResult = await coreAPI.searchDataSources(
    inputText,
    topK,
    credentials,
    false, // fullText
    searches,
    targetDocumentTokens
  );

  if (searchResult.isErr()) {
    return new Err({
      type: "internal_server_error",
      message: searchResult.error.message,
    });
  }

  // Transform CoreAPIDocument array to match the expected schema.
  // CoreAPIDocument doesn't include token_count, and has slightly different types.
  // We need to transform the documents to match the expected schema.
  const documents = searchResult.value.documents.map((doc) => ({
    data_source_id: doc.data_source_id,
    created: doc.created,
    document_id: doc.document_id,
    timestamp: doc.timestamp,
    title: doc.title,
    tags: doc.tags,
    parents: doc.parents,
    source_url: doc.source_url ?? null,
    hash: doc.hash,
    text_size: doc.text_size,
    text: doc.text ?? null,
    chunk_count: doc.chunk_count,
    chunks: doc.chunks.map((chunk) => ({
      text: chunk.text,
      hash: chunk.hash,
      offset: chunk.offset,
      score: chunk.score ?? 0,
      expanded_offsets: undefined, // This field may be added by Core API in some contexts
    })),
    token_count: Math.ceil(doc.text_size / 4), // Estimate: 1 token ≈ 4 characters
  }));

  return new Ok({
    result: documents,
    runId: null,
  });
}

// Must map CoreAPIDocument
const DocTrackerRetrievalActionValueSchema = t.array(
  t.type({
    data_source_id: t.string,
    created: t.Integer,
    document_id: t.string,
    timestamp: t.Integer,
    title: t.union([t.string, t.null]),
    tags: t.array(t.string),
    parents: t.array(t.string),
    source_url: t.union([t.string, t.null]),
    hash: t.string,
    text_size: t.Integer,
    text: t.union([t.string, t.null, t.undefined]),
    chunk_count: t.Integer,
    chunks: t.array(
      t.intersection([
        t.type({
          text: t.string,
          hash: t.string,
          offset: t.Integer,
          score: t.number,
        }),
        t.partial({
          expanded_offsets: t.array(t.Integer),
        }),
      ])
    ),
    token_count: t.Integer,
  })
);
