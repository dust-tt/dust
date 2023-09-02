import { Request, Response } from "express";

import { Connector, SlackConfiguration } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";

type GetSlackbotEnabledRes = {
  botEnabled: boolean;
};

type ToggleSlackbotReqBody = {
  botEnabled: boolean;
};

const _getBotEnabled = async (
  req: Request<{ connector_id: string }, GetSlackbotEnabledRes, undefined>,
  res: Response<GetSlackbotEnabledRes>
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

  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connector.id,
    },
  });

  if (!slackConfig) {
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: "Slack configuration not found",
      },
      status_code: 500,
    });
  }

  return res.status(200).json({
    botEnabled: slackConfig.botEnabled,
  });
};

const _setBotEnabled = async (
  req: Request<{ connector_id: string }, ToggleSlackbotReqBody>,
  res: Response<ToggleSlackbotReqBody>
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

  const slackConfig = await SlackConfiguration.findOne({
    where: {
      connectorId: connector.id,
    },
  });

  if (!slackConfig) {
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: "Slack configuration not found",
      },
      status_code: 500,
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
  slackConfig.botEnabled = req.body.botEnabled;
  await slackConfig.save();

  return res.status(200).json({
    botEnabled: slackConfig.botEnabled,
  });
};

export const getBotEnabledAPIHandler = withLogging(_getBotEnabled);
export const setBotEnabledAPIHandler = withLogging(_setBotEnabled);
