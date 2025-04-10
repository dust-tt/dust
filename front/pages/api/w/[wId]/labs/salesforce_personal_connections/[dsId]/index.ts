import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { SalesforceDataSourceWithPersonalConnection } from "@app/lib/swr/salesforce";

export type GetLabsTranscriptsConfigurationResponseBody = {
  configuration: LabsTranscriptsConfigurationResource | null;
};

export const PostPersonalConnectionBodySchema = t.type({
  connectionId: t.string,
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

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const dataSource = await DataSourceResource.fetchById(auth, dsId);

      if (!dataSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }

      await dataSource.removePersonalConnection(auth);

      return res.status(200).json({
        success: true,
      });
    }
    case "POST": {
      const bodyValidation = PostPersonalConnectionBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const validatedBody = bodyValidation.right;
      const { connectionId } = validatedBody;

      const dataSource = await DataSourceResource.fetchById(auth, dsId);
      if (!dataSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "The data source you requested was not found.",
          },
        });
      }
      await dataSource.createPersonalConnection(auth, {
        connectionId,
      });

      return res.status(200).json({
        success: true,
      });
    }
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
