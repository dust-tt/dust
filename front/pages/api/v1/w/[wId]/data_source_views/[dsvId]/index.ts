import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchDataSourceViewSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type GetOrPostDataSourceViewsResponseBody = {
  dataSourceView: DataSourceViewType;
};

export type PatchDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetOrPostDataSourceViewsResponseBody | PatchDataSourceViewResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_not_found",
        message: "this endpoint is only available to system api keys.",
      },
    });
  }

  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  switch (req.method) {
    case "GET":
      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });

    case "PATCH":
      const patchBodyValidation = PatchDataSourceViewSchema.decode(req.body);
      if (isLeft(patchBodyValidation)) {
        const pathError = reporter.formatValidationErrors(
          patchBodyValidation.left
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `invalid request body: ${pathError}`,
          },
        });
      }

      const { parentsIn } = patchBodyValidation.right;
      const updateResult = await dataSourceView.updateParents(parentsIn);

      if (updateResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "The data source view cannot be updated.",
          },
        });
      }

      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "the method passed is not supported, GET, POST, or PATCH is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
