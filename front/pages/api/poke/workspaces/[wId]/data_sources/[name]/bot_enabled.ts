import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";

export type BotEnabledResponseBody = {
  botEnabled: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BotEnabledResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const user = auth.user();
  const owner = auth.workspace();

  if (!user || !owner || !auth.isDustSuperUser()) {
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
      if (!req.body || typeof req.body.botEnabled !== "boolean") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing required parameters. Required: botEnabled (boolean)",
          },
        });
      }
      const { botEnabled } = req.body;

      const dataSource = await DataSource.findOne({
        where: {
          workspaceId: owner.id,
          name: req.query.name as string,
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

      const connectorRes = await ConnectorsAPI.setBotEnabled(
        dataSource.connectorId,
        botEnabled
      );

      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while enabling the bot`,
            connectors_error: connectorRes.error,
          },
        });
      }

      return res.status(200).json({ botEnabled: botEnabled });

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
