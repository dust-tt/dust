import type { ReturnedAPIErrorType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export const PostBotEnabledRequestBodySchema = t.type({
  botEnabled: t.boolean,
});

export type GetOrPostBotEnabledResponseBody = {
  botEnabled: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetOrPostBotEnabledResponseBody | ReturnedAPIErrorType | void
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

  if (!req.query.name || typeof req.query.name !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name);
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
      status_code: 404,
      api_error: {
        type: "data_source_error",
        message: "The data source you requested is not managed.",
      },
    });
  }
  const connectorsAPI = new ConnectorsAPI(logger);

  switch (req.method) {
    case "GET":
      const botEnabledRes = await connectorsAPI.getConnectorConfig(
        dataSource.connectorId,
        "botEnabled"
      );

      if (botEnabledRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_error",
            message: `Failed to retrieve bot enablement: ${botEnabledRes.error.error.message}`,
          },
        });
      }

      res
        .status(200)
        .json({ botEnabled: botEnabledRes.value.configValue === "true" });
      return;

    case "POST":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can edit the (bot) permissions of a data source.",
          },
        });
      }

      const bodyValidation = PostBotEnabledRequestBodySchema.decode(req.body);
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

      const setBotEnabledRes = await connectorsAPI.setConnectorConfig(
        dataSource.connectorId,
        "botEnabled",
        bodyValidation.right.botEnabled ? "true" : "false"
      );

      if (setBotEnabledRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: setBotEnabledRes.error.error.message,
          },
        });
      }

      res.status(200).json(setBotEnabledRes.value);
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

export default withLogging(handler);
