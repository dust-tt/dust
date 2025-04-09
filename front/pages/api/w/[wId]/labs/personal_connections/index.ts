import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { augmentDataSourceWithConnectorDetails } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  DataSourceWithPersonalConnection,
  WithAPIErrorResponse,
} from "@app/types";
import { ConnectorsAPI, removeNulls } from "@app/types";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const PostPersonalConnectionBodySchema = t.type({
  connectionId: t.string,
  dataSourceId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { success: boolean } | { dataSources: DataSourceWithPersonalConnection[] }
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  if (!flags.includes("labs_personal_connections")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "The feature is not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const dataSources = await DataSourceResource.listByWorkspace(auth);

      const augmentedDataSources = removeNulls(
        await concurrentExecutor(
          dataSources,
          async (dataSource: DataSourceResource) => {
            const ds = dataSource.toJSON();

            if (!isManaged(ds)) {
              return null;
            }

            // Only show salesforce for now
            if (ds.connectorProvider !== "salesforce") {
              return null;
            }

            const augmentedDataSource =
              await augmentDataSourceWithConnectorDetails(ds);
            if (!augmentedDataSource.connector) {
              return null;
            }

            const configRes = await connectorsAPI.getConnectorConfig(
              augmentedDataSource.connectorId,
              "usePersonalConnections"
            );

            const usePersonalConnections =
              configRes.isOk() && configRes.value.configValue;

            const personalConnection =
              await dataSource.getPersonalConnection(auth);
            return {
              ...augmentedDataSource,
              personalConnection: personalConnection ?? null,
              personalConnectionEnabled: usePersonalConnections === "true",
            };
          },
          { concurrency: 10 }
        )
      );

      return res.status(200).json({
        dataSources: augmentedDataSources,
      });
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
