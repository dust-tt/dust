import type {
  DataSourceSearchResultType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { dataSourceSearch } from "@app/lib/api/data_sources_search";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export type GetDocumentSearchResponseBody = {
  documents: DataSourceSearchResultType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetDocumentSearchResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();

  if (!owner || !plan || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const query = req.query.query as string;

      const searchRes = await dataSourceSearch({
        workspaceId: owner.sId,
        dataSourceNames: [],
        query: query,
      });

      res.status(200).json({
        documents: searchRes,
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
