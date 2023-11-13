import { Request, Response } from "express";

import {
  GET_BOT_ENABLED_BY_TYPE,
  TOGGLE_BOT_BY_TYPE,
} from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";

type GetBotEnabledRes = {
  botEnabled: boolean;
};

type ToggleBotReqBody = {
  botEnabled: boolean;
};

const _getBotEnabled = async (
  req: Request<{ connector_id: string }, GetBotEnabledRes, undefined>,
  res: Response<GetBotEnabledRes>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
    });
  }
  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }
  if (connector.type !== "slack") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Connector is not a slack connector",
      },
    });
  }

  const botEnabledRes = await GET_BOT_ENABLED_BY_TYPE[connector.type](
    connector.id
  );

  if (botEnabledRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `An error occurred while getting the bot status: ${botEnabledRes.error}`,
      },
    });
  }
  return res.status(200).json({
    botEnabled: botEnabledRes.value,
  });
};

const _setBotEnabled = async (
  req: Request<{ connector_id: string }, ToggleBotReqBody>,
  res: Response<ToggleBotReqBody>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
    });
  }
  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }
  if (!req.body || typeof req.body.botEnabled !== "boolean") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: botEnabled",
      },
    });
  }

  const toggleRes = await TOGGLE_BOT_BY_TYPE[connector.type](
    connector.id,
    req.body.botEnabled
  );

  if (toggleRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `An error occurred while toggling the bot: ${toggleRes.error.message}`,
      },
    });
  }
  return res.status(200).json({
    botEnabled: req.body.botEnabled,
  });
};

export const getBotEnabledAPIHandler = withLogging(_getBotEnabled);
export const setBotEnabledAPIHandler = withLogging(_setBotEnabled);
