import { Project } from "@app/types/project";

const { DUST_API: DUST_API_URL } = process.env;

type ErrorRsponse = { error: string };
type SuccessResponse<T> = { response: T };

type DustAPIResponse<T> = ErrorRsponse | SuccessResponse<T>;

export function isErrorResponse<T>(
  response: DustAPIResponse<T>
): response is { error: string } {
  return "error" in response;
}

type GetDatasetsResponse = {
  datasets: { [key: string]: { hash: string; created: number }[] };
};

type GetDatasetResponse = {
  dataset: {
    created: number;
    dataset_id: string;
    hash: string;
    keys: string[];
    data: { [key: string]: any }[];
  };
};

export const DustAPI = {
  async createProject(): Promise<DustAPIResponse<{ project: Project }>> {
    const response = await fetch(`${DUST_API_URL}/projects`, {
      method: "POST",
    });
    return response.json() as Promise<DustAPIResponse<{ project: Project }>>;
  },

  async getDatasets(
    projectId: string
  ): Promise<DustAPIResponse<GetDatasetsResponse>> {
    const datasets = await fetch(
      `${DUST_API_URL}/projects/${projectId}/datasets`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return datasets.json() as Promise<DustAPIResponse<GetDatasetsResponse>>;
  },

  async getDataset(
    projectId: string,
    datasetName: string,
    datasetHash: string
  ): Promise<DustAPIResponse<GetDatasetResponse>> {
    const dataset = await fetch(
      `${DUST_API_URL}/projects/${projectId}/datasets/${datasetName}/${datasetHash}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return dataset.json() as Promise<DustAPIResponse<GetDatasetResponse>>;
  },
};
