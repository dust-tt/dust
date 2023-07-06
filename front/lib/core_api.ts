import { createParser } from "eventsource-parser";

import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import { Project } from "@app/types/project";
import { CredentialsType } from "@app/types/provider";
import {
  BlockType,
  RunConfig,
  RunRunType,
  RunStatus,
  TraceType,
} from "@app/types/run";

const { CORE_API = "http://127.0.0.1:3001" } = process.env;

export type CoreAPIErrorResponse = {
  message: string;
  code: string;
};
export type CoreAPIResponse<T> = Result<T, CoreAPIErrorResponse>;

export type CoreAPIDatasetVersion = {
  hash: string;
  created: number;
};

export type CoreAPIDatasetWithoutData = CoreAPIDatasetVersion & {
  dataset_id: string;
  keys: string[];
};

export type CoreAPIDataset = CoreAPIDatasetWithoutData & {
  data: { [key: string]: any }[];
};

export type CoreAPIDataSourceConfig = {
  provider_id: string;
  model_id: string;
  extras?: any | null;
  splitter_id: string;
  max_chunk_size: number;
  use_cache: boolean;
};

export type CoreAPIDataSource = {
  created: number;
  data_source_id: string;
  config: CoreAPIDataSourceConfig;
};

export type CoreAPIDocument = {
  data_source_id: string;
  created: number;
  document_id: string;
  timestamp: number;
  tags: string[];
  source_url?: string | null;
  hash: string;
  text_size: number;
  chunk_count: number;
  chunks: {
    text: string;
    hash: string;
    offset: number;
    vector?: number[] | null;
    score?: number | null;
  }[];
  text?: string | null;
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

type CoreAPICreateRunPayload = {
  runType: RunRunType;
  specification?: string | null;
  specificationHash?: string | null;
  datasetId?: string | null;
  inputs?: any[] | null;
  config: RunConfig;
  credentials: CredentialsType;
};

type GetDatasetResponse = {
  dataset: CoreAPIDataset;
};

type GetDatasetsResponse = {
  datasets: { [key: string]: CoreAPIDatasetVersion[] };
};

type CoreAPICreateDataSourcePayload = {
  dataSourceId: string;
  config: CoreAPIDataSourceConfig;
  credentials: CredentialsType;
};

type CoreAPIUpsertDocumentPayload = {
  documentId: string;
  timestamp?: number | null;
  tags: string[];
  sourceUrl?: string | null;
  text: string;
  credentials: CredentialsType;
};

export const CoreAPI = {
  async createProject(): Promise<CoreAPIResponse<{ project: Project }>> {
    const response = await fetch(`${CORE_API}/projects`, {
      method: "POST",
    });
    return _resultFromResponse(response);
  },

  async getDatasets(
    projectId: string
  ): Promise<CoreAPIResponse<GetDatasetsResponse>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/datasets`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return _resultFromResponse(response);
  },

  async getDataset(
    projectId: string,
    datasetName: string,
    datasetHash: string
  ): Promise<CoreAPIResponse<GetDatasetResponse>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/datasets/${datasetName}/${datasetHash}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return _resultFromResponse(response);
  },

  async createDataset(
    projectId: string,
    datasetId: string,
    data: any[]
  ): Promise<CoreAPIResponse<{ dataset: CoreAPIDatasetWithoutData }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/datasets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        data,
      }),
    });

    return _resultFromResponse(response);
  },

  async cloneProject(
    projectId: string
  ): Promise<CoreAPIResponse<{ project: Project }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/clone`, {
      method: "POST",
    });

    return _resultFromResponse(response);
  },

  async createRun(
    projectId: string,
    runAsWorkspaceId: string,
    payload: CoreAPICreateRunPayload
  ): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dust-Workspace-Id": runAsWorkspaceId,
      },
      body: JSON.stringify({
        run_type: payload.runType,
        specification: payload.specification,
        specification_hash: payload.specificationHash,
        dataset_id: payload.datasetId,
        inputs: payload.inputs,
        config: payload.config,
        credentials: payload.credentials,
      }),
    });

    return _resultFromResponse(response);
  },

  async createRunStream(
    projectId: string,
    runAsWorkspaceId: string,
    payload: CoreAPICreateRunPayload
  ): Promise<
    CoreAPIResponse<{
      chunkStream: AsyncGenerator<Uint8Array, void, unknown>;
      dustRunId: Promise<string>;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dust-Workspace-Id": runAsWorkspaceId,
        },
        body: JSON.stringify({
          run_type: payload.runType,
          specification: payload.specification,
          specification_hash: payload.specificationHash,
          dataset_id: payload.datasetId,
          inputs: payload.inputs,
          config: payload.config,
          credentials: payload.credentials,
        }),
      }
    );

    if (!response.ok || !response.body) {
      return _resultFromResponse(response);
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
            logger.error({ error: err }, "Failed parsing chunk from Core API");
          }
        }
      }
    });

    const reader = response.body.getReader();

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
        if (!hasRunId) {
          // once the stream is entirely consumed, if we haven't received a run id, reject the promise
          setImmediate(() => {
            logger.error("No run id received");
            rejectDustRunIdPromise(new Error("No run id received"));
          });
        }
      } catch (e) {
        logger.error(
          {
            error: e,
          },
          "Error streaming chunks"
        );
      } finally {
        reader.releaseLock();
      }
    };

    return new Ok({ chunkStream: streamChunks(), dustRunId: dustRunIdPromise });
  },

  async getRunsBatch(
    projectId: string,
    dustRunIds: string[]
  ): Promise<CoreAPIResponse<{ runs: { [key: string]: CoreAPIRun } }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/batch`,
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

    return _resultFromResponse(response);
  },

  async getRun(
    projectId: string,
    runId: string
  ): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getRunStatus(
    projectId: string,
    runId: string
  ): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}/status`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getSpecification(
    projectId: string,
    specificationHash: string
  ): Promise<
    CoreAPIResponse<{ specification: { created: number; data: string } }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/specifications/${specificationHash}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getRunBlock(
    projectId: string,
    runId: string,
    runType: BlockType,
    blockName: string
  ): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}/blocks/${runType}/${blockName}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async createDataSource(
    projectId: string,
    payload: CoreAPICreateDataSourcePayload
  ): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data_source_id: payload.dataSourceId,
          config: payload.config,
          credentials: payload.credentials,
        }),
      }
    );

    return _resultFromResponse(response);
  },

  async deleteDataSource(
    projectId: string,
    dataSourceName: string
  ): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}`,
      {
        method: "DELETE",
      }
    );

    return _resultFromResponse(response);
  },

  async searchDataSource(
    projectId: string,
    dataSourceName: string,
    payload: {
      query: string;
      topK: number;
      filter?: {
        tags: {
          in?: string[] | null;
          not?: string[] | null;
        };
        timestamp?: {
          gt?: number | null;
          lt?: number | null;
        };
      } | null;
      fullText: boolean;
      credentials: { [key: string]: string };
      target_document_tokens?: number | null;
    }
  ): Promise<CoreAPIResponse<{ documents: CoreAPIDocument[] }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: payload.query,
          top_k: payload.topK,
          filter: payload.filter,
          full_text: payload.fullText,
          credentials: payload.credentials,
          target_document_tokens: payload.target_document_tokens,
        }),
      }
    );

    return _resultFromResponse(response);
  },

  async getDataSourceDocuments(
    projectId: string,
    dataSourceName: string,
    limit: number,
    offset: number
  ): Promise<
    CoreAPIResponse<{
      offset: number;
      limit: number;
      total: number;
      documents: CoreAPIDocument[];
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getDataSourceDocument(
    projectId: string,
    dataSourceName: string,
    documentId: string,
    versionHash?: string | null
  ): Promise<
    CoreAPIResponse<{
      document: CoreAPIDocument;
      data_source: CoreAPIDataSource;
    }>
  > {
    const qs = versionHash ? `?version_hash=${versionHash}` : "";
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}${qs}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getDataSourceDocumentVersions(
    projectId: string,
    dataSourceName: string,
    documentId: string,
    limit = 10,
    offset = 0
  ): Promise<
    CoreAPIResponse<{
      document_versions: { hash: string; created: number }[];
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}/versions?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async upsertDataSourceDocument(
    projectId: string,
    dataSourceName: string,
    payload: CoreAPIUpsertDocumentPayload
  ): Promise<
    CoreAPIResponse<{
      document: CoreAPIDocument;
      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: payload.documentId,
          timestamp: payload.timestamp,
          text: payload.text,
          tags: payload.tags,
          source_url: payload.sourceUrl,
          credentials: payload.credentials,
        }),
      }
    );

    return _resultFromResponse(response);
  },

  async updateDataSourceDocumentTags(
    projectId: string,
    dataSourceName: string,
    payload: {
      documentId: string;
      add_tags?: string[];
      remove_tags?: string[];
    }
  ): Promise<
    CoreAPIResponse<{
      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        payload.documentId
      )}/tags`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          add_tags: payload.add_tags,
          remove_tags: payload.remove_tags,
        }),
      }
    );

    return _resultFromResponse(response);
  },

  async deleteDataSourceDocument(
    projectId: string,
    dataSourceName: string,
    documentId: string
  ): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}`,
      {
        method: "DELETE",
      }
    );

    return _resultFromResponse(response);
  },
};

async function _resultFromResponse<T>(
  response: Response
): Promise<CoreAPIResponse<T>> {
  const jsonResponse = await response.json();
  if (jsonResponse.error) {
    return new Err(jsonResponse.error);
  }
  return new Ok(jsonResponse.response);
}
