import { Err, Ok, Result } from "@app/lib/result";
import { Project } from "@app/types/project";

const { DUST_API: DUST_API_URL } = process.env;

type ErrorResponse = {
  message: string;
  code: number;
};
type DustAPIResponse<T> = Result<T, ErrorResponse>;

export type DustAPIDatasetVersion = {
  hash: string;
  created: number;
};

export type DustAPIDataset = DustAPIDatasetVersion & {
  dataset_id: string;
  keys: string[];
  data: { [key: string]: any }[];
};

type GetDatasetResponse = {
  dataset: DustAPIDataset;
};

type GetDatasetsResponse = {
  datasets: { [key: string]: DustAPIDatasetVersion[] };
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
