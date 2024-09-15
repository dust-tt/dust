import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { DatasourceSearchResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/search";
import { handleDataSourceSearch } from "@app/pages/api/w/[wId]/data_sources/[dsId]/search";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DatasourceSearchResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "poke_data_sources_search" }
  );
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      return handleDataSourceSearch({ req, res, dataSource });
    }
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

export default withSessionAuthentication(handler);
