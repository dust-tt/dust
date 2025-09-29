import { createParser } from "eventsource-parser";
import * as t from "io-ts";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { dustManagedCredentials } from "@app/types/api/credentials";
import type { EmbeddingProviderIdType } from "@app/types/assistant/assistant";
import type { ProviderVisibility } from "@app/types/connectors/connectors_api";
import type { CoreAPIContentNode } from "@app/types/core/content_node";
import type {
  CoreAPIDataSource,
  CoreAPIDataSourceConfig,
  CoreAPIDataSourceDocumentSection,
  CoreAPIDocument,
  CoreAPIDocumentBlob,
  CoreAPIDocumentVersion,
  CoreAPIFolder,
  CoreAPILightDocument,
  CoreAPITableBlob,
  EmbedderType,
} from "@app/types/core/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { DustAppSecretType } from "@app/types/dust_app_secret";
import type { GroupType } from "@app/types/groups";
import type { Project } from "@app/types/project";
import type { CredentialsType } from "@app/types/provider";
import type {
  BlockType,
  RunConfig,
  RunRunType,
  RunStatus,
  TraceType,
} from "@app/types/run";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { errorToString } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

const MAX_CHUNK_SIZE = 512;

export const EMBEDDING_CONFIGS: Record<EmbeddingProviderIdType, EmbedderType> =
  {
    openai: {
      model_id: "text-embedding-3-large-1536",
      provider_id: "openai",
      splitter_id: "base_v0",
      max_chunk_size: MAX_CHUNK_SIZE,
    },
    mistral: {
      model_id: "mistral-embed",
      provider_id: "mistral",
      splitter_id: "base_v0",
      max_chunk_size: MAX_CHUNK_SIZE,
    },
  } as const;

export type CoreAPIError = {
  message: string;
  code: string;
};

function isCoreAPIError(obj: unknown): obj is CoreAPIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "code" in obj &&
    typeof obj.code === "string"
  );
}

export type CoreAPIResponse<T> = Result<T, CoreAPIError>;

export type CoreAPIDatasetVersion = {
  hash: string;
  created: number;
};

export type CoreAPIDatasetWithoutData = CoreAPIDatasetVersion & {
  dataset_id: string;
  keys: string[];
};

export type CoreAPIDataset = CoreAPIDatasetWithoutData & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { [key: string]: any }[];
};

export type CoreAPIRun = {
  run_id: string;
  created: number;
  run_type: RunRunType;
  app_hash?: string | null;
  specification_hash?: string | null;
  config: RunConfig;
  status: RunStatus;
  traces: Array<[[BlockType, string], Array<Array<TraceType>>]>;
};

export type CoreAPITokenType = [number, string];

type CoreAPICreateRunParams = {
  projectId: string;
  runType: RunRunType;
  specification?: string | null;
  specificationHash?: string | null;
  datasetId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs?: any[] | null;
  config: RunConfig;
  credentials: CredentialsType;
  secrets: DustAppSecretType[];
  isSystemKey?: boolean;
  storeBlocksResults?: boolean;
};

type GetDatasetResponse = {
  dataset: CoreAPIDataset;
};

type GetDatasetsResponse = {
  datasets: { [key: string]: CoreAPIDatasetVersion[] };
};

export type CoreAPITableSchema = {
  name: string;
  value_type: "int" | "float" | "text" | "bool" | "datetime";
  possible_values: string[] | null;
}[];

export type CoreAPITable = {
  table_id: string;
  name: string;
  description: string;
  schema: CoreAPITableSchema | null;
  timestamp: number;
  tags: string[];
  parent_id: string | null;
  parents: string[];
  created: number;
  data_source_id: string;
  title: string;
  mime_type: string;
  remote_database_table_id: string | null;
  remote_database_secret_id: string | null;
};

export type CoreAPIRowValue =
  | number
  | string
  | boolean
  | { type: "datetime"; epoch: number; string_value?: string }
  | null;

export type CoreAPIRow = {
  row_id: string;
  value: Record<string, CoreAPIRowValue>;
};

export type CoreAPIQueryResult = {
  value: Record<string, string | number | boolean | null | undefined>;
};

export type CoreAPISearchFilter = {
  tags: {
    in: string[] | null;
    not: string[] | null;
  } | null;
  parents: {
    in: string[] | null;
    not: string[] | null;
  } | null;
  timestamp: {
    gt: number | null;
    lt: number | null;
  } | null;
};

export type CoreAPISortSpec = {
  field: string;
  direction: "asc" | "desc";
};

export type CoreAPISearchOptions = {
  cursor?: string;
  limit?: number;
  search_source_urls?: boolean;
  sort?: CoreAPISortSpec[];
};

export interface CoreAPISearchCursorRequest {
  sort?: CoreAPISortSpec[];
  limit?: number;
  cursor?: string;
}

export type SearchWarningCode = "truncated-query-clauses";

export interface CoreAPISearchNodesResponse {
  nodes: CoreAPIContentNode[];
  next_page_cursor: string | null;
  hit_count: number;
  hit_count_is_accurate: boolean;
  warning_code: SearchWarningCode | null;
}

export interface CoreAPISearchTagsResponse {
  tags: {
    tag: string;
    match_count: number;
    data_sources: string[];
  }[];
}

const CoreAPISearchScopeSchema = t.union([
  t.literal("nodes_titles"),
  t.literal("data_source_name"),
  t.literal("both"),
]);

export type CoreAPISearchScope = t.TypeOf<typeof CoreAPISearchScopeSchema>;

const CoreAPIDatasourceViewFilterSchema = t.intersection([
  t.type({
    data_source_id: t.string,
    view_filter: t.array(t.string),
  }),
  t.partial({
    search_scope: CoreAPISearchScopeSchema,
  }),
]);

export type CoreAPIDatasourceViewFilter = t.TypeOf<
  typeof CoreAPIDatasourceViewFilterSchema
>;

// Edge-ngram starts at 2 characters.
export const MIN_SEARCH_QUERY_SIZE = 2;

const CoreAPINodesSearchFilterSchema = t.intersection([
  t.type({
    data_source_views: t.array(CoreAPIDatasourceViewFilterSchema),
  }),
  t.partial({
    node_ids: t.array(t.string),
    node_types: t.array(t.string),
    parent_id: t.string,
    query: t.string,
    mime_types: t.partial({
      in: t.union([t.readonlyArray(t.string), t.null]),
      not: t.union([t.readonlyArray(t.string), t.null]),
    }),
  }),
]);

export type CoreAPINodesSearchFilter = t.TypeOf<
  typeof CoreAPINodesSearchFilterSchema
>;

export interface CoreAPIDataSourceStatsResponse {
  data_sources: {
    data_source_id: string;
    data_source_internal_id: string;
    timestamp: number;
    name: string;
    text_size: number;
    document_count: number;
  }[];
  overall_total_size: number;
}

export interface CoreAPIUpsertDataSourceDocumentPayload {
  projectId: string;
  dataSourceId: string;
  documentId: string;
  timestamp?: number | null;
  tags: string[];
  parentId: string | null;
  parents: string[];
  sourceUrl?: string | null;
  section: CoreAPIDataSourceDocumentSection;
  credentials: CredentialsType;
  lightDocumentOutput?: boolean;
  title: string;
  mimeType: string;
}

// TODO(keyword-search): Until we remove the `managed-` prefix, we need to
// sanitize the search name.
export function formatDataSourceDisplayName(name: string) {
  return name
    .replace(/[-_]/g, " ") // Replace both hyphens and underscores with spaces.
    .split(" ")
    .filter((part) => part !== "managed")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Counter-part of `DatabasesTablesUpsertPayload` in `core/bin/core_api.rs`.
type UpsertTableParams = {
  projectId: string;
  dataSourceId: string;
  tableId: string;
  name: string;
  description: string;
  timestamp: number | null;
  tags: string[];
  parentId: string | null;
  parents: string[];
  remoteDatabaseTableId?: string | null;
  remoteDatabaseSecretId?: string | null;
  title: string;
  mimeType: string;
  sourceUrl: string | null;
  checkNameUniqueness?: boolean;
};

function topKSortedDocuments(
  query: string | null,
  topK: number,
  documents: CoreAPIDocument[]
): CoreAPIDocument[] {
  // Extract all chunks with their document metadata
  const chunks = documents.flatMap((d) =>
    d.chunks.map((c) => ({
      document_id: d.document_id,
      timestamp: d.timestamp,
      chunk: c,
    }))
  );

  // Sort chunks by score or timestamp and truncate
  if (query) {
    chunks.sort((a, b) => (b.chunk.score ?? 0) - (a.chunk.score ?? 0));
  } else {
    chunks.sort((a, b) => b.timestamp - a.timestamp);
  }
  chunks.splice(topK);

  // Get documents without chunks
  const documentsMap = new Map<string, CoreAPIDocument>(
    documents.map((d) => [d.document_id, { ...d, chunks: [] }])
  );

  // Reinsert top_k chunks
  for (const { document_id, chunk } of chunks) {
    documentsMap.get(document_id)?.chunks.push(chunk);
  }

  // Filter out empty documents and convert to array
  const result = Array.from(documentsMap.values()).filter(
    (d) => d.chunks.length > 0
  );

  // Sort by top chunk score or timestamp
  if (query) {
    result.sort(
      (a, b) => (b.chunks[0]?.score ?? 0) - (a.chunks[0]?.score ?? 0)
    );
  } else {
    result.sort((a, b) => b.timestamp - a.timestamp);
  }
  result.splice(topK);

  return result;
}

export class CoreAPI {
  _url: string;
  declare _logger: LoggerInterface;
  _apiKey: string | null;

  constructor(
    config: {
      url: string;
      apiKey: string | null;
    },
    logger: LoggerInterface
  ) {
    this._url = config.url;
    this._logger = logger;
    this._apiKey = config.apiKey;
  }

  async createProject(): Promise<CoreAPIResponse<{ project: Project }>> {
    const response = await this._fetchWithError(`${this._url}/projects`, {
      method: "POST",
    });
    return this._resultFromResponse(response);
  }

  async deleteProject({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }

  async getDatasets({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<GetDatasetsResponse>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/datasets`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataset({
    projectId,
    datasetName,
    datasetHash,
  }: {
    projectId: string;
    datasetName: string;
    datasetHash: string;
  }): Promise<CoreAPIResponse<GetDatasetResponse>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/datasets/${encodeURIComponent(datasetName)}/${encodeURIComponent(
        datasetHash
      )}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return this._resultFromResponse(response);
  }

  async createDataset({
    projectId,
    datasetId,
    data,
  }: {
    projectId: string;
    datasetId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
  }): Promise<CoreAPIResponse<{ dataset: CoreAPIDatasetWithoutData }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/datasets`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          data,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async cloneProject({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<{ project: Project }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/clone`,
      {
        method: "POST",
      }
    );

    return this._resultFromResponse(response);
  }

  async createRun(
    workspace: LightWorkspaceType,
    featureFlags: WhitelistableFeature[],
    groups: GroupType[],
    {
      projectId,
      runType,
      specification,
      specificationHash,
      datasetId,
      inputs,
      config,
      credentials,
      secrets,
      isSystemKey,
      storeBlocksResults = true,
    }: CoreAPICreateRunParams
  ): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dust-Feature-Flags": featureFlags.join(","),
          "X-Dust-Group-Ids": groups.map((g) => g.sId).join(","),
          "X-Dust-IsSystemRun": isSystemKey ? "true" : "false",
          "X-Dust-Workspace-Id": workspace.sId,
        },
        body: JSON.stringify({
          run_type: runType,
          specification: specification,
          specification_hash: specificationHash,
          dataset_id: datasetId,
          inputs: inputs,
          config: config,
          credentials: credentials,
          secrets: secrets,
          store_blocks_results: storeBlocksResults,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async createRunStream(
    workspace: LightWorkspaceType,
    featureFlags: WhitelistableFeature[],
    groups: GroupType[],
    {
      projectId,
      runType,
      specification,
      specificationHash,
      datasetId,
      inputs,
      config,
      credentials,
      secrets,
      isSystemKey,
      storeBlocksResults = true,
    }: CoreAPICreateRunParams
  ): Promise<
    CoreAPIResponse<{
      chunkStream: AsyncGenerator<Uint8Array, void, unknown>;
      dustRunId: Promise<string>;
    }>
  > {
    const res = await this._fetchWithError(
      `${this._url}/projects/${projectId}/runs/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dust-Feature-Flags": featureFlags.join(","),
          "X-Dust-Group-Ids": groups.map((g) => g.sId).join(","),
          "X-Dust-IsSystemRun": isSystemKey ? "true" : "false",
          "X-Dust-Workspace-Id": workspace.sId,
        },
        body: JSON.stringify({
          run_type: runType,
          specification: specification,
          specification_hash: specificationHash,
          dataset_id: datasetId,
          inputs: inputs,
          config: config,
          credentials: credentials,
          secrets: secrets,
          store_blocks_results: storeBlocksResults,
        }),
      }
    );

    if (res.isErr()) {
      return res;
    }

    const response = res.value.response;

    if (!response.ok || !response.body) {
      return this._resultFromResponse(res);
    }

    let hasRunId = false;
    let rejectDustRunIdPromise: (err: Error) => void;
    let resolveDustRunIdPromise: (runId: string) => void;
    const dustRunIdPromise = new Promise<string>((resolve, reject) => {
      rejectDustRunIdPromise = reject;
      resolveDustRunIdPromise = resolve;
    });

    const parser = createParser((event) => {
      if (event.type === "event") {
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            if (data.content?.run_id && !hasRunId) {
              hasRunId = true;
              resolveDustRunIdPromise(data.content.run_id);
            }
          } catch (err) {
            this._logger.error(
              { error: err },
              "Failed parsing chunk from Core API"
            );
          }
        }
      }
    });

    const reader = response.body.getReader();
    const logger = this._logger;

    const streamChunks = async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.feed(new TextDecoder().decode(value));
          yield value;
        }
      } catch (e) {
        logger.error(
          {
            error: e,
            errorStr: JSON.stringify(e),
            errorSource: "createRunStream",
          },
          "Error streaming chunks"
        );
      } finally {
        if (!hasRunId) {
          // once the stream is entirely consumed, if we haven't received a run id, reject the promise
          setImmediate(() => {
            logger.error(
              { projectId, runType, specificationHash },
              "No run id received"
            );
            rejectDustRunIdPromise(new Error("No run id received"));
          });
        }
        reader.releaseLock();
      }
    };

    return new Ok({ chunkStream: streamChunks(), dustRunId: dustRunIdPromise });
  }

  async deleteRun({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/runs/${encodeURIComponent(runId)}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }

  async getRunsBatch({
    projectId,
    dustRunIds,
  }: {
    projectId: string;
    dustRunIds: string[];
  }): Promise<CoreAPIResponse<{ runs: { [key: string]: CoreAPIRun } }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/runs/batch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_ids: dustRunIds,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getRun({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/runs/${encodeURIComponent(runId)}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getRunStatus({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/runs/${encodeURIComponent(runId)}/status`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async cancelRun({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ success: boolean }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return this._resultFromResponse(response);
  }

  async getSpecificationHashes({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<{ hashes: string[] }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/specifications`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getSpecification({
    projectId,
    specificationHash,
  }: {
    projectId: string;
    specificationHash: string;
  }): Promise<
    CoreAPIResponse<{ specification: { created: number; data: string } }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/specifications/${encodeURIComponent(specificationHash)}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async saveSpecification({
    projectId,
    specification,
  }: {
    projectId: string;
    specification: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/specifications`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          specification,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getRunBlock({
    projectId,
    runId,
    blockType,
    blockName,
  }: {
    projectId: string;
    runId: string;
    blockType: BlockType;
    blockName: string;
  }): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/runs/${encodeURIComponent(runId)}/blocks/${encodeURIComponent(
        blockType
      )}/${encodeURIComponent(blockName)}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async createDataSource({
    projectId,
    config,
    credentials,
    name,
  }: {
    projectId: string;
    config: CoreAPIDataSourceConfig;
    credentials: CredentialsType;
    name: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(projectId)}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config,
          credentials: credentials,
          name: formatDataSourceDisplayName(name),
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async updateDataSource({
    projectId,
    dataSourceId,
    name,
  }: {
    projectId: string;
    dataSourceId: string;
    name: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(dataSourceId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formatDataSourceDisplayName(name),
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataSource({
    projectId,
    dataSourceId,
  }: {
    projectId: string;
    dataSourceId: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(dataSourceId)}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return this._resultFromResponse(response);
  }

  async deleteDataSource({
    projectId,
    dataSourceId,
  }: {
    projectId: string;
    dataSourceId: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(dataSourceId)}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }

  async searchDataSource(
    projectId: string,
    dataSourceId: string,
    payload: {
      query: string;
      topK: number;
      filter?: CoreAPISearchFilter | null;
      view_filter?: CoreAPISearchFilter | null;
      fullText: boolean;
      credentials: { [key: string]: string };
      target_document_tokens?: number | null;
    }
  ): Promise<CoreAPIResponse<{ documents: CoreAPIDocument[] }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(dataSourceId)}/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: payload.query,
          top_k: payload.topK,
          filter: payload.filter,
          view_filter: payload.view_filter,
          full_text: payload.fullText,
          credentials: payload.credentials,
          target_document_tokens: payload.target_document_tokens,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async searchDataSources(
    query: string,
    topK: number,
    credentials: { [key: string]: string },
    fullText: boolean,
    searches: {
      projectId: string;
      dataSourceId: string;
      filter?: CoreAPISearchFilter | null;
      view_filter: CoreAPISearchFilter;
    }[],
    target_document_tokens?: number | null
  ): Promise<CoreAPIResponse<{ documents: CoreAPIDocument[] }>> {
    const searchResults = await concurrentExecutor(
      searches,
      async (search) => {
        return this.searchDataSource(search.projectId, search.dataSourceId, {
          query: query,
          topK: topK,
          filter: search.filter,
          view_filter: search.view_filter,
          fullText: fullText,
          credentials: credentials,
          target_document_tokens: target_document_tokens,
        });
      },
      { concurrency: 10 }
    );

    // Check if all search results are successful, if not return the first error
    const errors = searchResults.filter((result) => result.isErr());
    if (errors.length > 0) {
      return errors[0];
    }

    // Combine all documents from search results
    const allDocuments = searchResults.flatMap((r) =>
      r.isOk() ? r.value.documents : []
    );

    const sortedDocuments = topKSortedDocuments(query, topK, allDocuments);

    return new Ok({
      documents: sortedDocuments,
    });
  }

  async getDataSourceDocuments(
    {
      dataSourceId,
      documentIds,
      projectId,
      viewFilter,
    }: {
      dataSourceId: string;
      documentIds?: string[];
      projectId: string;
      viewFilter?: CoreAPISearchFilter | null;
    },
    pagination?: { limit: number; offset: number }
  ): Promise<
    CoreAPIResponse<{
      documents: CoreAPIDocument[];
      limit: number;
      offset: number;
      total: number;
    }>
  > {
    const queryParams = new URLSearchParams();

    if (pagination) {
      queryParams.append("limit", String(pagination.limit));
      queryParams.append("offset", String(pagination.offset));
    }

    if (viewFilter) {
      queryParams.append("view_filter", JSON.stringify(viewFilter));
    }

    if (documentIds && documentIds.length > 0) {
      queryParams.append("document_ids", JSON.stringify(documentIds));
    }

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents?${queryParams.toString()}`,
      {
        method: "GET",
      }
    );
    return this._resultFromResponse(response);
  }

  async getDataSourceDocument({
    dataSourceId,
    documentId,
    projectId,
    versionHash,
    viewFilter,
  }: {
    dataSourceId: string;
    documentId: string;
    projectId: string;
    versionHash?: string | null;
    viewFilter?: CoreAPISearchFilter | null;
  }): Promise<
    CoreAPIResponse<{
      document: CoreAPIDocument;
      data_source: CoreAPIDataSource;
    }>
  > {
    const queryParams = new URLSearchParams();

    if (versionHash) {
      queryParams.append("version_hash", versionHash);
    }

    if (viewFilter) {
      queryParams.append("view_filter", JSON.stringify(viewFilter));
    }

    const qs = queryParams.toString();

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}${qs ? `?${qs}` : ""}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataSourceDocumentText({
    dataSourceId,
    documentId,
    projectId,
    offset,
    limit,
    grep,
    versionHash,
    viewFilter,
  }: {
    dataSourceId: string;
    documentId: string;
    projectId: string;
    offset?: number | null;
    limit?: number | null;
    grep?: string | null;
    versionHash?: string | null;
    viewFilter?: CoreAPISearchFilter | null;
  }): Promise<
    CoreAPIResponse<{
      text: string;
      total_characters: number;
      offset: number;
      limit: number | null;
    }>
  > {
    const queryParams = new URLSearchParams();

    if (offset !== null && offset !== undefined) {
      queryParams.append("offset", String(offset));
    }

    if (limit !== null && limit !== undefined) {
      queryParams.append("limit", String(limit));
    }

    if (grep) {
      queryParams.append("grep", grep);
    }

    if (versionHash) {
      queryParams.append("version_hash", versionHash);
    }

    if (viewFilter) {
      queryParams.append("view_filter", JSON.stringify(viewFilter));
    }

    const qs = queryParams.toString();

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}/text${qs ? `?${qs}` : ""}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataSourceDocumentVersions({
    projectId,
    dataSourceId,
    documentId,
    latest_hash,
    limit = 10,
    offset = 0,
  }: {
    projectId: string;
    dataSourceId: string;
    documentId: string;
    limit: number;
    offset: number;
    latest_hash?: string | null;
  }): Promise<
    CoreAPIResponse<{
      versions: CoreAPIDocumentVersion[];
      offset: number;
      limit: number;
      total: number;
    }>
  > {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    if (latest_hash) {
      params.append("latest_hash", latest_hash);
    }

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(
        documentId
      )}/versions?${params.toString()}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async upsertDataSourceDocument({
    projectId,
    dataSourceId,
    documentId,
    timestamp,
    tags,
    parentId,
    parents,
    sourceUrl,
    section,
    credentials,
    lightDocumentOutput = false,
    title,
    mimeType,
  }: CoreAPIUpsertDataSourceDocumentPayload): Promise<
    CoreAPIResponse<{
      document:
        | CoreAPIDocument
        // if lightDocumentOutput is true, we return this type
        | CoreAPILightDocument;

      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${projectId}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: documentId,
          timestamp,
          section,
          tags,
          parent_id: parentId,
          parents,
          source_url: sourceUrl,
          credentials,
          light_document_output: lightDocumentOutput,
          title: title,
          mime_type: mimeType,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataSourceDocumentBlob({
    projectId,
    dataSourceId,
    documentId,
  }: {
    projectId: string;
    dataSourceId: string;
    documentId: string;
  }): Promise<CoreAPIResponse<CoreAPIDocumentBlob>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${projectId}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}/blob`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return this._resultFromResponse(response);
  }

  async updateDataSourceDocumentTags({
    projectId,
    dataSourceId,
    documentId,
    addTags,
    removeTags,
  }: {
    projectId: string;
    dataSourceId: string;
    documentId: string;
    addTags?: string[];
    removeTags?: string[];
  }): Promise<
    CoreAPIResponse<{
      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}/tags`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          add_tags: addTags,
          remove_tags: removeTags,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async updateDataSourceDocumentParents({
    projectId,
    dataSourceId,
    documentId,
    parentId,
    parents,
  }: {
    projectId: string;
    dataSourceId: string;
    documentId: string;
    parentId: string | null;
    parents: string[];
  }): Promise<
    CoreAPIResponse<{
      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}/parents`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parents: parents,
          parent_id: parentId,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async deleteDataSourceDocument({
    projectId,
    dataSourceId,
    documentId,
  }: {
    projectId: string;
    dataSourceId: string;
    documentId: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }

  async scrubDataSourceDocumentDeletedVersions({
    projectId,
    dataSourceId,
    documentId,
  }: {
    projectId: string;
    dataSourceId: string;
    documentId: string;
  }): Promise<
    CoreAPIResponse<{
      versions: CoreAPIDocumentVersion[];
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/documents/${encodeURIComponent(documentId)}/scrub_deleted_versions`,
      {
        method: "POST",
      }
    );

    return this._resultFromResponse(response);
  }

  async tokenize({
    text,
    modelId,
    providerId,
  }: {
    text: string;
    modelId: string;
    providerId: string;
  }): Promise<CoreAPIResponse<{ tokens: CoreAPITokenType[] }>> {
    const credentials = dustManagedCredentials();
    const response = await this._fetchWithError(`${this._url}/tokenize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: false,
      body: JSON.stringify({
        text,
        model_id: modelId,
        provider_id: providerId,
        credentials,
      }),
    });

    return this._resultFromResponse(response);
  }

  async tokenizeBatch({
    texts,
    modelId,
    providerId,
  }: {
    texts: string[];
    modelId: string;
    providerId: string;
  }): Promise<CoreAPIResponse<{ tokens: CoreAPITokenType[][] }>> {
    const credentials = dustManagedCredentials();
    const response = await this._fetchWithError(`${this._url}/tokenize/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: false,
      body: JSON.stringify({
        texts,
        model_id: modelId,
        provider_id: providerId,
        credentials,
      }),
    });

    return this._resultFromResponse(response);
  }

  async dataSourceTokenize(
    {
      text,
      projectId,
      dataSourceId,
    }: {
      text: string;
      projectId: string;
      dataSourceId: string;
    },
    opts?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<CoreAPIResponse<{ tokens: CoreAPITokenType[] }>> {
    // Support optional timeout via AbortController to avoid excessively long calls.
    let signal: AbortSignal | undefined = opts?.signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (!signal && opts?.timeoutMs && opts.timeoutMs > 0) {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
    }
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(dataSourceId)}/tokenize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal,
      }
    );
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return this._resultFromResponse(response);
  }

  async tableValidateCSVContent({
    projectId,
    dataSourceId,
    bucket,
    bucketCSVPath,
  }: {
    projectId: string;
    dataSourceId: string;
    bucket: string;
    bucketCSVPath: string;
  }): Promise<
    CoreAPIResponse<{
      schema: CoreAPITableSchema;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/validate_csv_content`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bucket,
          bucket_csv_path: bucketCSVPath,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async upsertTable({
    projectId,
    dataSourceId,
    tableId,
    name,
    description,
    timestamp,
    tags,
    parentId,
    parents,
    remoteDatabaseTableId,
    remoteDatabaseSecretId,
    title,
    mimeType,
    sourceUrl,
    checkNameUniqueness,
  }: UpsertTableParams): Promise<CoreAPIResponse<{ table: CoreAPITable }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(dataSourceId)}/tables`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table_id: tableId,
          name: name,
          description: description,
          timestamp,
          tags,
          parent_id: parentId,
          parents,
          remote_database_table_id: remoteDatabaseTableId ?? null,
          remote_database_secret_id: remoteDatabaseSecretId ?? null,
          title,
          mime_type: mimeType,
          source_url: sourceUrl,
          check_name_uniqueness: checkNameUniqueness ?? false,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getTable({
    projectId,
    dataSourceId,
    tableId,
    viewFilter,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    viewFilter?: CoreAPISearchFilter | null;
  }): Promise<CoreAPIResponse<{ table: CoreAPITable }>> {
    const queryParams = new URLSearchParams();

    if (viewFilter) {
      queryParams.append("view_filter", JSON.stringify(viewFilter));
    }

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}?${queryParams.toString()}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getTables(
    {
      dataSourceId,
      projectId,
      tableIds,
      viewFilter,
    }: {
      dataSourceId: string;
      projectId: string;
      tableIds?: string[];
      viewFilter?: CoreAPISearchFilter | null;
    },
    pagination?: { limit: number; offset: number }
  ): Promise<
    CoreAPIResponse<{
      limit: number;
      offset: number;
      tables: CoreAPITable[];
      total: number;
    }>
  > {
    const queryParams = new URLSearchParams();

    if (viewFilter) {
      queryParams.append("view_filter", JSON.stringify(viewFilter));
    }

    if (tableIds && tableIds.length > 0) {
      queryParams.append("table_ids", JSON.stringify(tableIds));
    }

    if (pagination) {
      queryParams.append("limit", String(pagination.limit));
      queryParams.append("offset", String(pagination.offset));
    }

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables?${queryParams.toString()}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async deleteTable({
    projectId,
    dataSourceId,
    tableId,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }

  async updateTableParents({
    projectId,
    dataSourceId,
    tableId,
    parentId,
    parents,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    parentId: string | null;
    parents: string[];
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}/parents`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent_id: parentId,
          parents: parents,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async upsertTableRows({
    projectId,
    dataSourceId,
    tableId,
    rows,
    truncate,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    rows: CoreAPIRow[];
    truncate?: boolean;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}/rows`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows,
          truncate: truncate ?? false,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async tableUpsertCSVContent({
    projectId,
    dataSourceId,
    tableId,
    bucket,
    bucketCSVPath,
    truncate,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    bucket: string;
    bucketCSVPath: string;
    truncate?: boolean;
  }): Promise<
    CoreAPIResponse<{
      schema: CoreAPITableSchema;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}/csv`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bucket,
          bucket_csv_path: bucketCSVPath,
          truncate: truncate ?? false,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getTableRow({
    projectId,
    dataSourceId,
    tableId,
    rowId,
    filter,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    rowId: string;
    filter?: CoreAPISearchFilter | null;
  }): Promise<CoreAPIResponse<{ row: CoreAPIRow }>> {
    const qs = filter
      ? `?view_filter=${encodeURIComponent(JSON.stringify(filter))}`
      : "";
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(
        rowId
      )}${qs}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getTableRows({
    projectId,
    dataSourceId,
    tableId,
    limit,
    offset,
    filter,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    limit: number;
    offset: number;
    filter?: CoreAPISearchFilter | null;
  }): Promise<
    CoreAPIResponse<{
      rows: CoreAPIRow[];
      offset: number;
      limit: number;
      total: number;
    }>
  > {
    const qs = filter
      ? `&view_filter=${encodeURIComponent(JSON.stringify(filter))}`
      : "";
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(
        tableId
      )}/rows?limit=${limit}&offset=${offset}${qs}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataSourceTableBlob({
    projectId,
    dataSourceId,
    tableId,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
  }): Promise<CoreAPIResponse<CoreAPITableBlob>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${projectId}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}/blob`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return this._resultFromResponse(response);
  }

  async deleteTableRow({
    projectId,
    dataSourceId,
    tableId,
    rowId,
  }: {
    projectId: string;
    dataSourceId: string;
    tableId: string;
    rowId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(
        rowId
      )}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }

  async queryDatabase({
    tables,
    query,
  }: {
    tables: Array<{
      project_id: number;
      data_source_id: string;
      table_id: string;
    }>;
    query: string;
  }): Promise<
    CoreAPIResponse<{
      schema: CoreAPITableSchema;
      results: CoreAPIQueryResult[];
    }>
  > {
    const response = await this._fetchWithError(`${this._url}/query_database`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        tables: tables.map((t) => [t.project_id, t.data_source_id, t.table_id]),
      }),
    });

    return this._resultFromResponse(response);
  }

  async getDatabaseSchema({
    tables,
  }: {
    tables: Array<{
      project_id: number;
      data_source_id: string;
      table_id: string;
    }>;
  }): Promise<
    CoreAPIResponse<{
      dialect: string;
      schemas: Array<{
        dbml: string;
        head?: Array<Record<string, any>>;
      }>;
    }>
  > {
    const response = await this._fetchWithError(
      `${this._url}/database_schema`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tables: tables.map((t) => [
            t.project_id,
            t.data_source_id,
            t.table_id,
          ]),
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async getDataSourceFolders(
    {
      projectId,
      dataSourceId,
      folderIds,
      viewFilter,
    }: {
      projectId: string;
      dataSourceId: string;
      folderIds?: string[];
      viewFilter?: CoreAPISearchFilter | null;
    },
    pagination?: { limit: number; offset: number }
  ): Promise<
    CoreAPIResponse<{
      folders: CoreAPIFolder[];
      limit: number;
      offset: number;
      total: number;
    }>
  > {
    const queryParams = new URLSearchParams();

    if (pagination) {
      queryParams.append("limit", String(pagination.limit));
      queryParams.append("offset", String(pagination.offset));
    }

    if (viewFilter) {
      queryParams.append("view_filter", JSON.stringify(viewFilter));
    }

    if (folderIds && folderIds.length > 0) {
      queryParams.append("document_ids", JSON.stringify(folderIds));
    }

    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/folders?${queryParams.toString()}`,
      {
        method: "GET",
      }
    );
    return this._resultFromResponse(response);
  }

  async searchNodes({
    query,
    filter,
    options,
  }: {
    query?: string;
    filter: CoreAPINodesSearchFilter;
    options?: CoreAPISearchOptions;
  }): Promise<CoreAPIResponse<CoreAPISearchNodesResponse>> {
    const response = await this._fetchWithError(`${this._url}/nodes/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        filter,
        options,
      }),
    });

    return this._resultFromResponse(response);
  }

  async getDataSourceStats(
    query: { project_id: number; data_source_id: string }[]
  ): Promise<CoreAPIResponse<CoreAPIDataSourceStatsResponse>> {
    const response = await this._fetchWithError(`${this._url}/stats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
      }),
    });

    return this._resultFromResponse(response);
  }

  async searchTags({
    query,
    queryType,
    dataSourceViews,
    limit,
  }: {
    query?: string;
    queryType?: "exact" | "prefix" | "match";
    dataSourceViews: DataSourceViewType[];
    limit?: number;
  }): Promise<CoreAPIResponse<CoreAPISearchTagsResponse>> {
    const dataSourceViewsFilter: CoreAPIDatasourceViewFilter[] =
      dataSourceViews.map((dsv) => ({
        data_source_id: dsv.dataSource.dustAPIDataSourceId,
        view_filter: dsv.parentsIn ?? [],
      }));

    const response = await this._fetchWithError(`${this._url}/tags/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data_source_views: dataSourceViewsFilter,
        query,
        query_type: queryType,
        limit,
      }),
    });

    return this._resultFromResponse(response);
  }

  async getDataSourceFolder({
    projectId,
    dataSourceId,
    folderId,
  }: {
    projectId: string;
    dataSourceId: string;
    folderId: string;
    viewFilter?: CoreAPISearchFilter | null;
  }): Promise<CoreAPIResponse<{ folder: CoreAPIFolder }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/folders/${encodeURIComponent(folderId)}`,
      {
        method: "GET",
      }
    );

    return this._resultFromResponse(response);
  }

  async upsertDataSourceFolder({
    projectId,
    dataSourceId,
    folderId,
    timestamp,
    parentId,
    parents,
    title,
    mimeType,
    sourceUrl,
    providerVisibility,
  }: {
    projectId: string;
    dataSourceId: string;
    folderId: string;
    timestamp: number | null;
    parentId: string | null;
    parents: string[];
    title: string;
    mimeType: string;
    sourceUrl?: string | null;
    providerVisibility: ProviderVisibility | null | undefined;
  }): Promise<CoreAPIResponse<{ folder: CoreAPIFolder }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${projectId}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/folders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folder_id: folderId,
          timestamp,
          title,
          parent_id: parentId,
          parents,
          mime_type: mimeType,
          source_url: sourceUrl,
          provider_visibility: providerVisibility,
        }),
      }
    );

    return this._resultFromResponse(response);
  }

  async deleteDataSourceFolder({
    projectId,
    dataSourceId,
    folderId,
  }: {
    projectId: string;
    dataSourceId: string;
    folderId: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await this._fetchWithError(
      `${this._url}/projects/${encodeURIComponent(
        projectId
      )}/data_sources/${encodeURIComponent(
        dataSourceId
      )}/folders/${encodeURIComponent(folderId)}`,
      {
        method: "DELETE",
      }
    );

    return this._resultFromResponse(response);
  }
  private async _fetchWithError(
    url: string,
    init?: RequestInit
  ): Promise<Result<{ response: Response; duration: number }, CoreAPIError>> {
    const now = Date.now();
    try {
      const params = { ...init };
      if (this._apiKey) {
        params.headers = {
          ...params.headers,
          Authorization: `Bearer ${this._apiKey}`,
        };
      }
      const res = await fetch(url, params);
      return new Ok({ response: res, duration: Date.now() - now });
    } catch (e) {
      const duration = Date.now() - now;
      const isAbort =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        (init && init.signal && (init.signal as AbortSignal).aborted) ||
        // Some environments throw an AbortError with name property.
        (e as any)?.name === "AbortError";
      const err: CoreAPIError = isAbort
        ? {
            code: "request_timeout",
            message: `CoreAPI request aborted due to timeout`,
          }
        : {
            code: "unexpected_network_error",
            message: `Unexpected network error from CoreAPI: ${e}`,
          };
      this._logger.error(
        {
          url,
          duration,
          coreError: err,
          error: e,
          errorMessage: errorToString(e),
        },
        "CoreAPI error"
      );
      return new Err(err);
    }
  }

  private async _resultFromResponse<T>(
    res: Result<
      {
        response: Response;
        duration: number;
      },
      CoreAPIError
    >
  ): Promise<CoreAPIResponse<T>> {
    if (res.isErr()) {
      return res;
    }

    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await res.value.response.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      const err: CoreAPIError = {
        code: "unexpected_response_format",
        message: `Unexpected response format from CoreAPI: ${e}`,
      };

      this._logger.error(
        {
          coreError: err,
          parseError: e,
          rawText: text,
          status: res.value.response.status,
          url: res.value.response.url,
          duration: res.value.duration,
        },
        "CoreAPI error"
      );
      return new Err(err);
    }

    if (!res.value.response.ok) {
      const err = json?.error;
      if (isCoreAPIError(err)) {
        this._logger.error(
          {
            coreError: err,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "CoreAPI error"
        );
        return new Err(err);
      } else {
        const err: CoreAPIError = {
          code: "unexpected_error_format",
          message: "Unexpected error format from CoreAPI",
        };
        this._logger.error(
          {
            coreError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "CoreAPI error"
        );
        return new Err(err);
      }
    } else {
      const err = json?.error;
      const res = json?.response;

      if (err && isCoreAPIError(err)) {
        this._logger.error(
          {
            coreError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "CoreAPI error"
        );
        return new Err(err);
      } else if (res) {
        return new Ok(res);
      } else {
        const err: CoreAPIError = {
          code: "unexpected_response_format",
          message: "Unexpected response format from CoreAPI",
        };
        this._logger.error(
          {
            coreError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "CoreAPI error"
        );
        return new Err(err);
      }
    }
  }
}
