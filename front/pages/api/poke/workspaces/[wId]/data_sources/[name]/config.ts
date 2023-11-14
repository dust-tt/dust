import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource, Workspace } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export type SetConfigResponseBody = {
  configKey: string;
  configValue: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetConfigResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(session, null);
  const user = auth.user();

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const { wId } = req.query;
      if (!wId || typeof wId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request query is invalid, expects { workspaceId: string }.",
          },
        });
      }

      const { name } = req.query;

      if (!req.body || typeof req.body.configKey !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing required parameters. Required: configKey (string)",
          },
        });
      }
      if (!req.body || typeof req.body.configValue !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing required parameters. Required: configValue (string)",
          },
        });
      }
      const { configKey, configValue } = req.body;

      const workspace = await Workspace.findOne({
        where: {
          sId: wId,
        },
      });

      if (!workspace) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Could not find the workspace.",
          },
        });
      }

      const dataSource = await DataSource.findOne({
        where: {
          workspaceId: workspace.id,
          name,
        },
      });

      if (!dataSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Could not find the data source.",
          },
        });
      }

      if (!dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "ConnectorId not set.",
          },
        });
      }

      const connectorRes = await ConnectorsAPI.setConnectorConfig(
        dataSource.connectorId,
        configKey,
        configValue
      );

      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while setting the connector configuration`,
            connectors_error: connectorRes.error,
          },
        });
      }

      return res.status(200).json({ configKey, configValue });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
