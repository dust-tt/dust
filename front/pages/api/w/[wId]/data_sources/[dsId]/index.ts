import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  deleteDataSource,
  MANAGED_DS_DELETABLE_AS_BUILDER,
} from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";

export type GetOrPostDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetOrPostDataSourceResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!req.query.name || typeof req.query.name !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    req.query.name,
    // TODO(DATASOURCE_SID): Clean-up and rename parameter as [dsId]
    { origin: "data_source_get_or_post" }
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
    case "GET":
      res.status(200).json({
        dataSource: dataSource.toJSON(),
      });
      return;

    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update a data source.",
          },
        });
      }

      if (dataSource.connectorId) {
        // managed data source
        if (
          !req.body ||
          typeof req.body.assistantDefaultSelected !== "boolean" ||
          Object.keys(req.body).length !== 1
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Only the assistantDefaultSelected setting can be updated for managed data sources, which must be boolean.",
            },
          });
        }

        await dataSource.setDefaultSelectedForAssistant(
          req.body.assistantDefaultSelected
        );
      } else {
        // non-managed data source
        if (
          !req.body ||
          (typeof req.body.description !== "string" &&
            typeof req.body.assistantDefaultSelected !== "boolean")
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The request body is missing",
            },
          });
        }

        if (typeof req.body.description === "string") {
          await dataSource.setDescription(req.body.description);
        }

        if (typeof req.body.assistantDefaultSelected === "boolean") {
          await dataSource.setDefaultSelectedForAssistant(
            req.body.assistantDefaultSelected
          );
        }
      }

      return res.status(200).json({
        dataSource: dataSource.toJSON(),
      });

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can delete a data source.",
          },
        });
      }

      // We only allow deleteing selected managed data sources as builder.
      if (
        dataSource.connectorId &&
        dataSource.connectorProvider &&
        !MANAGED_DS_DELETABLE_AS_BUILDER.includes(dataSource.connectorProvider)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Managed data sources cannot be deleted.",
          },
        });
      }

      const dRes = await deleteDataSource(auth, dataSource);
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
