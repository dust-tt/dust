import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSourceViewUsage } from "@app/lib/api/agent_data_sources";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentsUsageType,
  DataSourceViewType,
  WithAPIErrorResponse,
} from "@app/types";

export type DataSourceViewWithUsage = DataSourceViewType & {
  usage: AgentsUsageType | null;
};

export type PokeListDataSourceViews = {
  data_source_views: DataSourceViewWithUsage[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListDataSourceViews>>,
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

      const dataSourceViewsWithUsage = await concurrentExecutor(
        dataSourceViews,
        async (dsv) => {
          const usageResult = await getDataSourceViewUsage({
            auth,
            dataSourceView: dsv,
          });
          return {
            ...dsv.toJSON(),
            usage: usageResult.isOk() ? usageResult.value : null,
          };
        },
        { concurrency: 4 }
      );

      return res.status(200).json({
        data_source_views: dataSourceViewsWithUsage,
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

export default withSessionAuthenticationForPoke(handler);
