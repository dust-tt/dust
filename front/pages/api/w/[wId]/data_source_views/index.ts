import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourceViewsResponseBody = {
  dataSourceViews: DataSourceViewType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.user();
  const plan = auth.plan();
  if (!plan || !user || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source view you requested was not found.",
      },
    });
  }

  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);

  switch (req.method) {
    case "GET":
      res
        .status(200)
        .json({ dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()) });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspaceAsUser(handler);
