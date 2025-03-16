import { isLeft } from "fp-ts/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { apiError } from "@app/logger/withlogging";
import type { DataSourceViewType, WithAPIErrorResponse } from "@app/types";
import { assertNever, PatchDataSourceViewSchema } from "@app/types";

export type PatchDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

export type GetDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewResponseBody>>,
  auth: Authenticator,
  { dataSourceView }: { dataSourceView: DataSourceViewResource }
): Promise<void> {
  if (!dataSourceView.canReadOrAdministrate(auth)) {
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
      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });
    }

    case "PATCH": {
      const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
      if (killSwitches?.includes("save_data_source_views")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message:
              "Saving data source views is temporarily disabled, try again later.",
          },
        });
      }

      const patchBodyValidation = PatchDataSourceViewSchema.decode(req.body);

      if (isLeft(patchBodyValidation)) {
        const pathError = reporter.formatValidationErrors(
          patchBodyValidation.left
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            message: `invalid request body: ${pathError}`,
            type: "invalid_request_error",
          },
        });
      }

      const { right: patchBody } = patchBodyValidation;

      const r = await handlePatchDataSourceView(
        auth,
        patchBody,
        dataSourceView
      );
      if (r.isErr()) {
        switch (r.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message: r.error.message,
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: r.error.message,
              },
            });
          default:
            assertNever(r.error.code);
        }
      }

      return res.status(200).json({
        dataSourceView: r.value.toJSON(),
      });
    }

    case "DELETE": {
      if (!dataSourceView.canAdministrate(auth)) {
        // Only admins, or builders who have to the space, can patch.
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users that are `admins` can administrate spaces.",
          },
        });
      }

      const force = req.query.force === "true";
      if (!force) {
        const usageRes = await dataSourceView.getUsagesByAgents(auth);
        if (usageRes.isErr() || usageRes.value.count > 0) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "data_source_error",
              message: usageRes.isOk()
                ? `The data source view is in use by ${usageRes.value.agentNames.join(", ")} and cannot be deleted.`
                : "The data source view is in use and cannot be deleted.",
            },
          });
        }
      }

      // Directly, hard delete the data source view.
      await dataSourceView.delete(auth, { hardDelete: true });

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    dataSourceView: { requireCanReadOrAdministrate: true },
  })
);
