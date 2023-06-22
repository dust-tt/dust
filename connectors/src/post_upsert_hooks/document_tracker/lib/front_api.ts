import axios, { AxiosResponse } from "axios";

import logger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
const FRONT_API = process.env.FRONT_API;
if (!FRONT_API) {
  throw new Error("FRONT_API not set");
}

export async function shouldRunDocumentTracker(
  dataSourceConfig: DataSourceConfig,
  documentId: string
): Promise<boolean> {
  const localLogger = logger.child({
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
    documentId,
  });

  localLogger.info("Checking if document tracker should run");

  const endpoint = `${FRONT_API}/api/w/${dataSourceConfig.workspaceId}/document_tracker/should_run`;
  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.get(endpoint, {
      headers: {
        Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
      },
      params: {
        data_source_name: dataSourceConfig.dataSourceName,
        document_id: documentId,
      },
    });
  } catch (e) {
    localLogger.error(
      { error: e },
      "Error checking if document tracker should run."
    );
    throw e;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    localLogger.info("Successfully checked if document tracker should run.");
    return dustRequestResult.data.should_run;
  }

  localLogger.error(
    {
      status: dustRequestResult.status,
    },
    "Error checking if document tracker should run."
  );
  throw new Error(
    `Error checking if document tracker should run: ${dustRequestResult}`
  );
}
