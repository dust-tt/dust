import { Err, Ok, Result } from "@app/lib/result";
import { Project } from "@app/types/project";
import { BlockType, RunConfig, RunRunType, RunType } from "@app/types/run";
import { streamChunks } from "./http_utils";

const { DUST_API: DUST_API_URL } = process.env;

export type DustAPIErrorResponse = {
  message: string;
  code: number;
};
export type DustAPIResponse<T> = Result<T, DustAPIErrorResponse>;

export type DustAPIDatasetVersion = {
  hash: string;
  created: number;
};

export type DustAPIDatasetWithoutData = DustAPIDatasetVersion & {
  dataset_id: string;
  keys: string[];
};

export type DustAPIDataset = DustAPIDatasetWithoutData & {
  data: { [key: string]: any }[];
};

export type DustAPIDataSourceConfig = {
  provider_id: string;
  model_id: string;
  extras?: any | null;
  splitter_id: string;
  max_chunk_size: number;
  use_cache: boolean;
};

export type DustAPIDataSource = {
  created: number;
  data_source_id: string;
  config: DustAPIDataSourceConfig;
};

export type DustAPIDocument = {
  data_source_id: string;
  created: number;
  document_id: string;
  timestamp: number;
  tags: string[];
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

type DustAPICreateRunPayload = {
  runType: RunRunType;
  specification?: string | null;
  specificationHash?: string | null;
  datasetId?: string | null;
  inputs?: any[] | null;
  config: RunConfig;
  credentials: { [key: string]: string };
};

type GetDatasetResponse = {
  dataset: DustAPIDataset;
};

type GetDatasetsResponse = {
  datasets: { [key: string]: DustAPIDatasetVersion[] };
};

type GetRunsResponse = {
  offset: number;
  limit: number;
  total: number;
  runs: RunType[];
};

type DustAPICreateDataSourcePayload = {
  dataSourceId: string;
  config: DustAPIDataSourceConfig;
  credentials: { [key: string]: string };
};

type DustAPIUpsertDocumentPayload = {
  documentId: string;
  timestamp?: number | null;
  tags: string[];
  text: string;
  credentials: { [key: string]: string };
};

export const DustAPI = {
  async createProject(): Promise<DustAPIResponse<{ project: Project }>> {
    const response = await fetch(`${DUST_API_URL}/projects`, {
      method: "POST",
    });
    return _resultFromResponse(response);
  },

  async getDatasets(
    projectId: string
  ): Promise<DustAPIResponse<GetDatasetsResponse>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/datasets`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return _resultFromResponse(response);
  },

  async getDataset(
    projectId: string,
    datasetName: string,
    datasetHash: string
  ): Promise<DustAPIResponse<GetDatasetResponse>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/datasets/${datasetName}/${datasetHash}`,
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
  ): Promise<DustAPIResponse<{ dataset: DustAPIDatasetWithoutData }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/datasets`,
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

    return _resultFromResponse(response);
  },

  async cloneProject(
    projectId: string
  ): Promise<DustAPIResponse<{ project: Project }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/clone`,
      {
        method: "POST",
      }
    );

    return _resultFromResponse(response);
  },

  async createRun(
    projectId: string,
    dustUserId: string,
    payload: DustAPICreateRunPayload
  ): Promise<DustAPIResponse<{ run: RunType }>> {
    const response = await fetch(`${DUST_API_URL}/projects/${projectId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dust-User-Id": dustUserId,
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
    dustUserId: string,
    payload: DustAPICreateRunPayload
  ): Promise<DustAPIResponse<AsyncGenerator<Uint8Array, void, unknown>>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/runs/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dust-User-Id": dustUserId,
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

    return new Ok(streamChunks(response.body));
  },

  async getRuns(
    projectId: string,
    limit: number,
    offset: number,
    runType: RunRunType
  ): Promise<DustAPIResponse<GetRunsResponse>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/runs?limit=${limit}&offset=${offset}&run_type=${runType}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getRunStatus(
    projectId: string,
    runId: string
  ): Promise<DustAPIResponse<{ run: RunType }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/runs/${runId}/status`,
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
    DustAPIResponse<{ specification: { created: number; data: string } }>
  > {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/specifications/${specificationHash}`,
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
  ): Promise<DustAPIResponse<{ run: RunType }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/runs/${runId}/blocks/${runType}/${blockName}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async createDataSource(
    projectId: string,
    payload: DustAPICreateDataSourcePayload
  ): Promise<DustAPIResponse<{ data_source: DustAPIDataSource }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources`,
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
  ): Promise<DustAPIResponse<{ data_source: DustAPIDataSource }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources/${dataSourceName}`,
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
    }
  ): Promise<DustAPIResponse<{ documents: DustAPIDocument[] }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources/${dataSourceName}/search`,
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
    DustAPIResponse<{
      offset: number;
      limit: number;
      total: number;
      documents: DustAPIDocument[];
    }>
  > {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources/${dataSourceName}/documents?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async getDataSourceDocument(
    projectId: string,
    dataSourceName: string,
    documentId: string
  ): Promise<
    DustAPIResponse<{
      document: DustAPIDocument;
      data_source: DustAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  },

  async upsertDataSourceDocument(
    projectId: string,
    dataSourceName: string,
    payload: DustAPIUpsertDocumentPayload
  ): Promise<
    DustAPIResponse<{
      document: DustAPIDocument;
      data_source: DustAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources/${dataSourceName}/documents`,
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
          credentials: payload.credentials,
        }),
      }
    );

    return _resultFromResponse(response);
  },

  async deleteDataSourceDocument(
    projectId: string,
    dataSourceName: string,
    documentId: string
  ): Promise<DustAPIResponse<{ data_source: DustAPIDataSource }>> {
    const response = await fetch(
      `${DUST_API_URL}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
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
): Promise<DustAPIResponse<T>> {
  const jsonResponse = await response.json();
  if (jsonResponse.error) {
    return new Err(jsonResponse.error);
  }
  return new Ok(jsonResponse.response);
}
