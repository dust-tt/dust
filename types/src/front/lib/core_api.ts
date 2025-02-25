import { createParser } from "eventsource-parser";
import * as t from "io-ts";

import { CoreAPIContentNode } from "../../core/content_node";
import {
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
} from "../../core/data_source";
import { DustAppSecretType } from "../../front/dust_app_secret";
import { GroupType } from "../../front/groups";
import { dustManagedCredentials } from "../../front/lib/api/credentials";
import { EmbeddingProviderIdType } from "../../front/lib/assistant";
import { Project } from "../../front/project";
import { CredentialsType } from "../../front/provider";
import {
  BlockType,
  RunConfig,
  RunRunType,
  RunStatus,
  TraceType,
} from "../../front/run";
import { LightWorkspaceType } from "../../front/user";
import { LoggerInterface } from "../../shared/logger";
import { Err, Ok, Result } from "../../shared/result";
import { ProviderVisibility } from "./connectors_api";

export const MAX_CHUNK_SIZE = 512;

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

export function isCoreAPIError(obj: unknown): obj is CoreAPIError {
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

export function isRowMatchingSchema(
  row: CoreAPIRow,
  schema: CoreAPITableSchema
) {
  for (const [k, v] of Object.entries(row.value)) {
    if (v === null) {
      continue;
    }
    if (typeof v === "string" && v.trim().length === 0) {
      continue;
    }
    const schemaEntry = schema.find((s) => s.name === k);
    if (!schemaEntry) {
      return false;
    }

    if (schemaEntry.value_type === "int" && typeof v !== "number") {
      return false;
    } else if (schemaEntry.value_type === "float" && typeof v !== "number") {
      return false;
    } else if (schemaEntry.value_type === "text" && typeof v !== "string") {
      return false;
    } else if (schemaEntry.value_type === "bool" && typeof v !== "boolean") {
      return false;
    } else if (
      schemaEntry.value_type === "datetime" &&
      (typeof v !== "object" ||
        !v ||
        typeof v.epoch !== "number" ||
        (v.string_value && typeof v.string_value !== "string"))
    ) {
      return false;
    }
  }

  return true;
}

export type CoreAPIQueryResult = {
  value: Record<string, unknown>;
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
  limit?: number;
  cursor?: string;
  sort?: CoreAPISortSpec[];
};

export interface CoreAPISearchCursorRequest {
  sort?: CoreAPISortSpec[];
  limit?: number;
  cursor?: string;
}

export interface CoreAPISearchNodesResponse {
  nodes: CoreAPIContentNode[];
  next_page_cursor: string | null;
  hit_count: number;
  hit_count_is_accurate: boolean;
}

export interface CoreAPISearchTagsResponse {
  error: string | null;
  response: {
    tags: {
      tag: string;
      match_count: number;
      data_sources: string[];
    }[];
  };
}

export const CoreAPIDatasourceViewFilterSchema = t.type({
  data_source_id: t.string,
  view_filter: t.array(t.string),
});

export type CoreAPIDatasourceViewFilter = t.TypeOf<
  typeof CoreAPIDatasourceViewFilterSchema
>;

export const MIN_SEARCH_QUERY_SIZE = 3;

export const CoreAPINodesSearchFilterSchema = t.intersection([
  t.type({
    data_source_views: t.array(CoreAPIDatasourceViewFilterSchema),
  }),
  t.partial({
    node_ids: t.array(t.string),
    parent_id: t.string,
    node_types: t.array(t.string),
    query: t.string,
    include_data_sources: t.boolean,
  }),
]);

export type CoreAPINodesSearchFilter = t.TypeOf<
  typeof CoreAPINodesSearchFilterSchema
>;

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
          "X-Dust-Workspace-Id": workspace.sId,
          "X-Dust-Group-Ids": groups.map((g) => g.sId).join(","),
          "X-Dust-IsSystemRun": isSystemKey ? "true" : "false",
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
          "X-Dust-Workspace-Id": workspace.sId,
          "X-Dust-Group-Ids": groups.map((g) => g.sId).join(","),
          "X-Dust-IsSystemRun": isSystemKey ? "true" : "false",
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
          config: config,
          credentials: credentials,
          name,
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
          name,
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

  async dataSourceTokenize({
    text,
    projectId,
    dataSourceId,
  }: {
    text: string;
    projectId: string;
    dataSourceId: string;
  }): Promise<CoreAPIResponse<{ tokens: CoreAPITokenType[] }>> {
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
      }
    );
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
  }: {
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
  }): Promise<CoreAPIResponse<{ table: CoreAPITable }>> {
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
          truncate: truncate || false,
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
          truncate: truncate || false,
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
    filter,
  }: {
    tables: Array<{
      project_id: string;
      data_source_id: string;
      table_id: string;
    }>;
    query: string;
    filter?: CoreAPISearchFilter | null;
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
        tables,
        filter,
      }),
    });

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

  async searchTags({
    query,
    queryType,
    dataSources,
  }: {
    query?: string;
    queryType?: string;
    dataSources: string[];
  }): Promise<CoreAPIResponse<CoreAPISearchTagsResponse>> {
    const response = await this._fetchWithError(`${this._url}/tags/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data_source_views: dataSources.map((dataSource) => ({
          data_source_id: dataSource,
          view_filter: [],
        })),
        query,
        query_type: queryType,
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
      const err: CoreAPIError = {
        code: "unexpected_network_error",
        message: `Unexpected network error from CoreAPI: ${e}`,
      };
      this._logger.error(
        {
          url,
          duration,
          coreError: err,
          error: e,
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
