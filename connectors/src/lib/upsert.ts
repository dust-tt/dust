import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const FRONT_API = process.env.FRONT_API;
if (!FRONT_API) {
  throw new Error("FRONT_API not set");
}

export async function upsertToDatasource(
  dataSourceConfig: DataSourceConfig,
  documentId: string,
  documentText: string,
  documentUrl?: string,
  timestamp?: number,
  tags?: string[],
  retries = 3,
  delayBetweenRetriesMs = 500
) {
  if (retries < 1) {
    throw new Error("retries must be >= 1");
  }
  const errors = [];
  for (let i = 0; i < retries; i++) {
    try {
      const upsertRes = await _upsertToDatasource(
        dataSourceConfig,
        documentId,
        documentText,
        documentUrl,
        timestamp,
        tags
      );

      return upsertRes;
    } catch (e) {
      await new Promise((resolve) =>
        setTimeout(resolve, delayBetweenRetriesMs)
      );
      errors.push(e);
    }
  }

  throw new Error(errors.join("\n"));
}

async function _upsertToDatasource(
  dataSourceConfig: DataSourceConfig,
  documentId: string,
  documentText: string,
  documentUrl?: string,
  timestamp?: number,
  tags?: string[]
) {
  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/documents/${documentId}`;
  const dustRequestPayload = {
    text: documentText,
    source_url: documentUrl,
    timestamp,
    tags,
  };
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.post(
      endpoint,
      dustRequestPayload,
      dustRequestConfig
    );
  } catch (e) {
    logger.error(errorFromAny(e), "Error uploading document to Dust.");
    throw e;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    logger.info(
      { documentId, workspaceId: dataSourceConfig.workspaceId },
      "Successfully uploaded document to Dust."
    );
  } else {
    logger.error(
      {
        documentId,
        workspaceId: dataSourceConfig.workspaceId,
        status: dustRequestResult.status,
      },
      "Error uploading document to Dust."
    );
    throw new Error(`Error uploading to dust: ${dustRequestResult}`);
  }
}
