import type { DataSourceType } from "@dust-tt/types";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type DeleteDataSourceResponseBody = DataSourceType;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeleteDataSourceResponseBody>>,
  session: SessionWithUser
): Promise<void> {
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
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
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
    case "DELETE":
      const { wId } = req.query;
      if (!wId || typeof wId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { workspaceId: string }.",
          },
        });
      }

      const dataSourceViews = await DataSourceViewResource.listForDataSources(
        auth,
        [dataSource]
      );
      const viewsUsageByAgentsRes = await Promise.all(
        dataSourceViews.map((view) => view.getUsagesByAgents(auth))
      );

      const viewsUsedByAgentsName = viewsUsageByAgentsRes.reduce(
        (acc, usageRes) => {
          if (usageRes.isOk() && usageRes.value.count > 0) {
            usageRes.value.agentNames.forEach((name) => acc.add(name));
          }

          return acc;
        },
        new Set<string>()
      );

      if (viewsUsedByAgentsName.size > 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The data source is in use by ${viewsUsedByAgentsName.size} agent(s) [${Array.from(viewsUsedByAgentsName).join(", ")}].`,
          },
        });
      }

      const delRes = await softDeleteDataSourceAndLaunchScrubWorkflow(
        auth,
        dataSource
      );
      if (delRes.isErr()) {
        switch (delRes.error.code) {
          case "unauthorized_deletion":
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "workspace_auth_error",
                message: `You are not authorized to delete this data source: ${delRes.error.message}`,
              },
            });
          default:
            assertNever(delRes.error.code);
        }
      }

      return res.status(200).json(delRes.value);

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthentication(handler);
