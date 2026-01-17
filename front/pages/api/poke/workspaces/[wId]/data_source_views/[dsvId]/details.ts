import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { dataSourceViewToPokeJSON } from "@app/lib/poke/utils";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { PokeDataSourceViewType, WithAPIErrorResponse } from "@app/types";

export type PokeGetDataSourceViewDetails = {
  dataSourceView: PokeDataSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetDataSourceViewDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, dsvId } = req.query;
  if (typeof wId !== "string" || typeof dsvId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or data source view ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const dataSourceView = await DataSourceViewResource.fetchById(
        auth,
        dsvId,
        {
          includeEditedBy: true,
        }
      );

      if (!dataSourceView) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_view_not_found",
            message: "Data source view not found.",
          },
        });
      }

      return res.status(200).json({
        dataSourceView: await dataSourceViewToPokeJSON(dataSourceView),
      });

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

export default withSessionAuthenticationForPoke(handler);
