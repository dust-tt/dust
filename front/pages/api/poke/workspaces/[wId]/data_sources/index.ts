import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export type PokeListDataSources = {
  data_sources: DataSourceType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListDataSources>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Could not find the data source.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const dataSources = await DataSourceResource.listByWorkspace(auth, {
        includeEditedBy: true,
      });

      return res.status(200).json({
        data_sources: dataSources.map((ds) => ds.toJSON()),
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

export default withSessionAuthentication(handler);
