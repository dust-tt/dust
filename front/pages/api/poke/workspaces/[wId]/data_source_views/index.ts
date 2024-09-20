import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type PokeListDataSourceViews = {
  data_source_views: DataSourceViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListDataSourceViews>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "Could not find the data source view.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const dataSourceViews = await DataSourceViewResource.listByWorkspace(
        auth,
        { includeEditedBy: true }
      );

      return res.status(200).json({
        data_source_views: dataSourceViews.map((dsv) => dsv.toJSON()),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
