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
import { isWebsite } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
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
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { dsId, spaceId } = req.query;
  if (typeof dsId !== "string" || typeof spaceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource || dataSource.space.sId !== spaceId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.canRead(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that have `read` permission for the current space can access a data source configuration.",
      },
    });
  }

  if (dataSource.space.isConversations()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  // Only Slack & Webcrawler connectors have configurations.
  // SlackConfiguration.botEnabled can only be updated from a Poke route.
  // So these routes are currently only for Webcrawler connectors.
  if (!dataSource.connectorId || !isWebsite(dataSource)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_managed",
        message: "Cannot read/update the configuration of this Data Source.",
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
      if (!dataSource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that have `write` permission for the current space can update a data source configuration.",
          },
        });
      }

      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update a data source configuration.",
          },
        });
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
