import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI } from "@app/types";

export const PostManagedDataSourceConfigRequestBodySchema = t.type({
  configValue: t.string,
});

export type GetOrPostManagedDataSourceConfigResponseBody = {
  configValue: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetOrPostManagedDataSourceConfigResponseBody | void>
  >,
  auth: Authenticator
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

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_error",
        message: "The data source you requested is not managed.",
      },
    });
  }
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const configKey = req.query.key;
  if (!configKey || typeof configKey !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid config key: ${configKey}`,
      },
    });
  }

  // We only allow setting and retrieving `botEnabled` (Slack), `codeSyncEnabled` (GitHub),
  // `intercomConversationsNotesSyncEnabled` (Intercom), `zendeskSyncUnresolvedTicketsEnabled` and `zendeskHideCustomerDetails`.
  // This is mainly to prevent users from enabling other configs that are not released (e.g., google_drive `pdfEnabled`).
  if (
    ![
      "botEnabled",
      "codeSyncEnabled",
      "intercomConversationsNotesSyncEnabled",
      "zendeskSyncUnresolvedTicketsEnabled",
      "zendeskHideCustomerDetails",
      "gongRetentionPeriodDays",
    ].includes(configKey)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid config key: ${configKey}`,
      },
    });
  }

  switch (req.method) {
    case "GET":
      const configRes = await connectorsAPI.getConnectorConfig(
        dataSource.connectorId,
        configKey
      );

      if (configRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_error",
            message: `Failed to retrieve config for data source.`,
            connectors_error: configRes.error,
          },
        });
      }

      res.status(200).json({ configValue: configRes.value.configValue });
      return;

    case "POST":
      if (!auth.isAdmin() || !dataSource.canAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace " +
              "can edit the configuration of a data source.",
          },
        });
      }

      const bodyValidation =
        PostManagedDataSourceConfigRequestBodySchema.decode(req.body);
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

      const setConfigRes = await connectorsAPI.setConnectorConfig(
        dataSource.connectorId,
        configKey,
        bodyValidation.right.configValue
      );

      if (setConfigRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "Failed to edit the configuration of the data source.",
            connectors_error: setConfigRes.error,
          },
        });
      }

      res.status(200).json({ configValue: bodyValidation.right.configValue });
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
