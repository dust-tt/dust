import { Request, Response } from "express";

import { Connector, SlackConfiguration } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import {
  GET_BOT_ENABLED_BY_TYPE,
  TOGGLE_BOT_BY_TYPE,
} from "@connectors/connectors";

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
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }
  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }
  if (connector.type !== "slack") {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Connector is not a slack connector",
      },
      status_code: 500,
    });
  }

  const botEnabledRes = await GET_BOT_ENABLED_BY_TYPE[connector.type](
    connector.id
  );

  if (botEnabledRes.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: `An error occurred while getting the bot status: ${botEnabledRes.error}`,
      },
      status_code: 500,
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
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }
  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }
  if (!req.body || typeof req.body.botEnabled !== "boolean") {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: botEnabled",
      },
      status_code: 400,
    });
  }

  const toggleRes = await TOGGLE_BOT_BY_TYPE[connector.type](
    connector.id,
    req.body.botEnabled
  );

  if (toggleRes.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: `An error occurred while enabling the bot: ${toggleRes.error}`,
      },
      status_code: 500,
    });
  }
  return res.status(200).json({
    botEnabled: req.body.botEnabled,
  });
};

export const getBotEnabledAPIHandler = withLogging(_getBotEnabled);
export const setBotEnabledAPIHandler = withLogging(_setBotEnabled);
