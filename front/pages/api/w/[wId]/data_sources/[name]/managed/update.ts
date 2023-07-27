import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import {
  ConnectorsAPI,
  ConnectorsAPIErrorResponse,
} from "@app/lib/connectors_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

// TODO (@fontanierh): camelCase -> snake_case
const PostManagedDataSourceSettingsRequestBodySchema = t.type({
  connectionId: t.union([t.string, t.null, t.undefined]),
  defaultNewResourcePermission: t.union([
    t.literal("read"),
    t.literal("read_write"),
    t.literal("write"),
    t.literal("none"),
    t.undefined,
    t.null,
  ]),
});

export type GetDataSourceUpdateResponseBody = {
  connectorId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetDataSourceUpdateResponseBody | ReturnedAPIErrorType | void
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation =
        PostManagedDataSourceSettingsRequestBodySchema.decode(req.body);

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { connectionId, defaultNewResourcePermission } =
        bodyValidation.right;

      const updateRes = await ConnectorsAPI.updateConnector({
        connectorId: dataSource.connectorId.toString(),
        params: {
          connectionId,
          defaultNewResourcePermission,
        },
      });

      if (updateRes.isErr()) {
        const errorRes = updateRes as { error: ConnectorsAPIErrorResponse };
        const error = errorRes.error.error;

        if (error.type === "connector_oauth_target_mismatch") {
          return apiError(req, res, {
            api_error: {
              type: error.type,
              message: error.message,
            },
            status_code: 401,
          });
        } else {
          return apiError(req, res, {
            api_error: {
              type: "connector_update_error",
              message: `Could not update the connector: ${error.message}`,
            },
            status_code: 500,
          });
        }
      }
      res.status(200).json(updateRes.value);
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
