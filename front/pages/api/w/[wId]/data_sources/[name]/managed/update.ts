import type { WithAPIErrorResponse } from "@dust-tt/types";
import {
  ConnectorsAPI,
  sendUserOperationMessage,
  UpdateConnectorRequestBodySchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourceUpdateResponseBody = {
  connectorId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDataSourceUpdateResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user || !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can edit the permissions of a data source.",
      },
    });
  }

  // fetchByName enforces through auth the authorization (workspace here mainly).
  const dataSource = await DataSourceResource.fetchByName(
    auth,
    req.query.name as string
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
      const bodyValidation = UpdateConnectorRequestBodySchema.decode(req.body);

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

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const updateRes = await connectorsAPI.updateConnector({
        connectorId: dataSource.connectorId.toString(),
        connectionId: bodyValidation.right.connectionId,
      });
      const email = user.email;
      if (email && !isDisposableEmailDomain(email)) {
        void sendUserOperationMessage({
          logger: logger,
          message:
            `${email} updated the data source \`${dataSource.name}\` ` +
            `for workspace \`${owner.name}\` sId: \`${owner.sId}\` ` +
            `connectorId: \`${dataSource.connectorId}\``,
        });
      }

      if (updateRes.isErr()) {
        if (updateRes.error.type === "connector_oauth_target_mismatch") {
          return apiError(req, res, {
            api_error: {
              type: updateRes.error.type,
              // The error message is meant to be user friendly and explannative, customized for the
              // connection being updated.
              message: `OAuth mismatch: ${updateRes.error.message}`,
              connectors_error: updateRes.error,
            },
            status_code: 401,
          });
        } else {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Could not update the connector`,
              connectors_error: updateRes.error,
            },
          });
        }
      }

      await dataSource.setEditedBy(user);
      void ServerSideTracking.trackDataSourceUpdated({
        dataSource: dataSource.toJSON(),
        user,
        workspace: owner,
      });

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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
