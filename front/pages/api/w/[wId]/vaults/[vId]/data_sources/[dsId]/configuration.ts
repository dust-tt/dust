import type {
  ConnectorConfiguration,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  ConnectorsAPI,
  ioTsParsePayload,
  UpdateConnectorConfigurationTypeSchema,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourceConfigurationResponseBody = {
  configuration: ConnectorConfiguration;
};

export type PatchDataSourceConfigurationResponseBody =
  GetDataSourceConfigurationResponseBody;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetDataSourceConfigurationResponseBody
      | PatchDataSourceConfigurationResponseBody
      | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (typeof req.query.vId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  const vault = await VaultResource.fetchById(auth, req.query.vId);
  if (!vault) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }
  if (!auth.hasPermission([vault.acl()], "read")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that have `read` permission for the current vault can access a data source configuration.",
      },
    });
  }

  if (!req.query.dsId || typeof req.query.dsId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }
  const dataSource = await DataSourceResource.fetchById(auth, req.query.dsId);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  // Config is only for data sources with a connector provider.
  if (!dataSource.connectorProvider || !dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_managed",
        message:
          "Cannot read/update the configuration of this Data Source because it is not managed.",
      },
    });
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  switch (req.method) {
    case "GET":
      const connectorRes = await connectorsAPI.getConnector(
        dataSource.connectorId
      );
      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "connector_not_found_error",
            message: `An error occured while fetching the connector's configuration`,
          },
        });
      }
      return res.send({
        configuration: connectorRes.value.configuration,
      });

    case "PATCH":
      if (!auth.hasPermission([vault.acl()], "write")) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that have `read` permission for the current vault can update a data source configuration.",
          },
        });
      }

      if (vault.isSystem() && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Only the users that are `admins` for the current workspace can update a data source configuration from system vault.",
          },
        });
      } else if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update a data source configuration.",
          },
        });
      }

      switch (dataSource.connectorProvider) {
        // Check which parameters are being updated here if you add a case.
        // SlackConfiguration.botEnabled can only be updated from a Poke route.
        case "webcrawler": {
          // For WebCrawler, all parameters can be updated.
          break;
        }
        default: {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "data_source_error",
              message:
                "The configuration of this Data Source cannot be updated.",
            },
          });
        }
      }

      const parseRes = ioTsParsePayload(
        req.body,
        UpdateConnectorConfigurationTypeSchema
      );
      if (parseRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${parseRes.error}`,
          },
        });
      }

      const updateRes = await connectorsAPI.updateConfiguration({
        connectorId: dataSource.connectorId.toString(),
        configuration: { configuration: parseRes.value.configuration },
      });
      if (updateRes.isErr()) {
        return apiError(
          req,
          res,
          {
            status_code: 500,
            api_error: {
              type: "connector_update_error",
              message: `An error occured while updating the connector's configuration`,
            },
          },
          new Error(updateRes.error.message)
        );
      }

      res.status(200).json({
        configuration: updateRes.value.configuration,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
