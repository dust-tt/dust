import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

const SearchDataSourceViewsQuerySchema = t.type({
  dataSourceId: t.union([t.string, t.undefined]),
  kind: t.union([t.string, t.undefined]),
  vaultId: t.union([t.string, t.undefined]),
  vaultKind: t.union([t.string, t.undefined]),
});

export type SearchDataSourceViewsResponseBody = {
  data_source_views: DataSourceViewType[];
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchDataSourceViewsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "This endpoint is only available to system api keys.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = SearchDataSourceViewsQuerySchema.decode(
        req.query
      );
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { vaultId, dataSourceId, kind, vaultKind } = queryValidation.right;

      const data_source_views = await DataSourceViewResource.search(auth, {
        vaultId,
        dataSourceId,
        kind,
        vaultKind,
      });

      res.status(200).json({
        data_source_views: data_source_views.map((dsv) => dsv.toJSON()),
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
