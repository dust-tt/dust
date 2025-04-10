import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { SalesforceDataSourceWithPersonalConnection } from "@app/lib/swr/salesforce";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { removeNulls } from "@app/types";

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
      | { success: boolean }
      | { dataSources: SalesforceDataSourceWithPersonalConnection[] }
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);

  if (!flags.includes("labs_salesforce_personal_connections")) {
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
      const salesforceDataSources =
        await DataSourceResource.listByConnectorProvider(auth, "salesforce");

      const augmentedDataSources = removeNulls(
        await concurrentExecutor(
          salesforceDataSources,
          async (dataSource: DataSourceResource) => {
            const ds = dataSource.toJSON();

            if (!isManaged(ds)) {
              return null;
            }

            const personalConnection =
              await dataSource.getPersonalConnection(auth);
            return {
              ...ds,
              personalConnection: personalConnection ?? null,
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
