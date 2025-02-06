import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";

const PatchDataSourceWithoutProviderRequestBodySchema = t.type({
  description: t.string,
});

type PatchSpaceDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchSpaceDataSourceResponseBody | void>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
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

  if (space.isSystem() && !space.canAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Only the users that are `admins` for the current workspace can update a data source.",
      },
    });
  } else if (space.isGlobal() && !space.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can update a data source.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource || dataSource.space.sId !== space.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      if (dataSource.connectorId) {
        // Not implemented yet, next PR will allow patching a website.
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Managed data sources cannot be updated.",
          },
        });
      }

      const bodyValidation =
        PatchDataSourceWithoutProviderRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body to patch a static data source: ${pathError}`,
          },
        });
      }
      const { description } = bodyValidation.right;

      await dataSource.setDescription(description);

      return res.status(200).json({
        dataSource: dataSource.toJSON(),
      });
    }
    case "DELETE": {
      const isAuthorized =
        space.canWrite(auth) ||
        // Only allow to remote database connectors if the user is an admin.
        (space.isSystem() &&
          space.canAdministrate(auth) &&
          isRemoteDatabase(dataSource));

      if (!isAuthorized) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that have `write` permission for the current space can delete a data source.",
          },
        });
      }

      if (
        dataSource.connectorId &&
        dataSource.connectorProvider &&
        !CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider].isDeletable
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Managed data sources cannot be deleted.",
          },
        });
      }

      const dRes = await softDeleteDataSourceAndLaunchScrubWorkflow(
        auth,
        dataSource
      );
      if (dRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: dRes.error.message,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
