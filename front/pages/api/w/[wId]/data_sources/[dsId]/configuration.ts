import type { ConnectorType, WithAPIErrorResponse } from "@dust-tt/types";
import {
  assertNever,
  ConnectorsAPI,
  ioTsParsePayload,
  UpdateConnectorConfigurationTypeSchema,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type PostDataSourceConfigurationResBody = {
  connector: ConnectorType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostDataSourceConfigurationResBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access Data Source configuration.",
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
  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "data_source_configuration" }
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

  if (!dataSource.connectorProvider || !dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_managed",
        message:
          "Cannot update the configuration of this Data Source because it is not managed.",
      },
    });
  }

  switch (dataSource.connectorProvider) {
    case "webcrawler": {
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update the configuration of this Data Source.",
          },
        });
      }
      break;
    }
    case "confluence":
    case "github":
    case "google_drive":
    case "intercom":
    case "notion":
    case "microsoft":
    case "slack":
    case "snowflake":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can update the configuration of this Data Source.",
          },
        });
      }
      break;

    default:
      assertNever(dataSource.connectorProvider);
  }

  switch (req.method) {
    case "PATCH":
      switch (dataSource.connectorProvider) {
        // Check which parameters are being updated here.
        // Eg: For WebCrawler, all parameters can be updated, but the
        // SlackConfiguration.pdfEnabled can only be updated
        // from Poke (once this settings is moved to the new configuration system).
        case "webcrawler": {
          // Webcrawler configuration can be updated.
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

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

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
        connector: updateRes.value,
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
