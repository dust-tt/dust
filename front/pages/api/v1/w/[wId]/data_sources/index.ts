import { DataSourceType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetDataSourcesResponseBody = {
  data_sources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDataSourcesResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const dataSources = await getDataSources(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({
        data_sources: dataSources,
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

export default withLogging(handler);
