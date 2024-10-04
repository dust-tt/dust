import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSources } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourcesResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const dataSources = await getDataSources(auth);

  switch (req.method) {
    case "GET":
      res
        .status(200)
        .json({ dataSources: dataSources.map((ds) => ds.toJSON()) });
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

export default withSessionAuthenticationForWorkspace(handler);
