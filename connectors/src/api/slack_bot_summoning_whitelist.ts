import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WhitelistedBotType } from "@connectors/resources/slack_configuration_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import { zodParsePayload } from "@connectors/types";
import type { Request, Response } from "express";
import { z } from "zod";

const WHITELIST_TYPE = "summon_agent" as const;

const ConnectorIdQuerySchema = z.object({
  connector_id: z.string(),
});

const PostBodySchema = z.object({
  connector_id: z.string(),
  bot_name: z.string().trim().min(1),
  group_ids: z.array(z.string()).min(1),
  space_ids: z.array(z.string()).min(1).optional(),
});

const DeleteBodySchema = z.object({
  connector_id: z.string(),
  bot_name: z.string().trim().min(1),
});

type GetSlackBotSummoningWhitelistResBody = WithConnectorsAPIErrorReponse<{
  bots: WhitelistedBotType[];
}>;

type MutateSlackBotSummoningWhitelistResBody = WithConnectorsAPIErrorReponse<{
  success: true;
}>;

async function fetchSlackConfiguration(connectorId: string) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector || connector.type !== "slack_bot") {
    return null;
  }

  const { configuration } = connector;

  return configuration instanceof SlackConfigurationResource
    ? configuration
    : null;
}

const _getSlackBotSummoningWhitelistHandler = async (
  req: Request<Record<string, string>>,
  res: Response<GetSlackBotSummoningWhitelistResBody>
) => {
  const queryValidation = zodParsePayload(req.query, ConnectorIdQuerySchema);
  if (queryValidation.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query: ${queryValidation.error}`,
      },
      status_code: 400,
    });
  }

  const slackConfig = await fetchSlackConfiguration(
    queryValidation.value.connector_id
  );
  if (!slackConfig) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Slack bot connector not found",
      },
      status_code: 404,
    });
  }

  const bots = await slackConfig.listWhitelistedBots(WHITELIST_TYPE);

  res.status(200).json({ bots });
};

export const getSlackBotSummoningWhitelistHandler = withLogging(
  _getSlackBotSummoningWhitelistHandler
);

const _postSlackBotSummoningWhitelistHandler = async (
  req: Request<Record<string, string>, MutateSlackBotSummoningWhitelistResBody>,
  res: Response<MutateSlackBotSummoningWhitelistResBody>
) => {
  const bodyValidation = zodParsePayload(req.body, PostBodySchema);
  if (bodyValidation.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error}`,
      },
      status_code: 400,
    });
  }

  const {
    connector_id: connectorId,
    bot_name: botName,
    group_ids: groupIds,
    space_ids: spaceIds,
  } = bodyValidation.value;

  const slackConfig = await fetchSlackConfiguration(connectorId);
  if (!slackConfig) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Slack bot connector not found",
      },
      status_code: 404,
    });
  }

  const whitelistRes = await slackConfig.whitelistBot(
    botName,
    { groupIds, spaceIds: spaceIds ?? null },
    WHITELIST_TYPE
  );
  if (whitelistRes.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "connector_update_error",
        message: whitelistRes.error.message,
      },
      status_code: 500,
    });
  }

  res.status(200).json({ success: true });
};

export const postSlackBotSummoningWhitelistHandler = withLogging(
  _postSlackBotSummoningWhitelistHandler
);

const _deleteSlackBotSummoningWhitelistHandler = async (
  req: Request<Record<string, string>, MutateSlackBotSummoningWhitelistResBody>,
  res: Response<MutateSlackBotSummoningWhitelistResBody>
) => {
  const bodyValidation = zodParsePayload(req.body, DeleteBodySchema);
  if (bodyValidation.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyValidation.error}`,
      },
      status_code: 400,
    });
  }

  const { connector_id: connectorId, bot_name: botName } = bodyValidation.value;

  const slackConfig = await fetchSlackConfiguration(connectorId);
  if (!slackConfig) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Slack bot connector not found",
      },
      status_code: 404,
    });
  }

  const destroyedCount = await slackConfig.removeWhitelistedBot(
    botName,
    WHITELIST_TYPE
  );
  if (destroyedCount === 0) {
    return apiError(req, res, {
      api_error: {
        type: "not_found",
        message: `No whitelisted bot named "${botName}"`,
      },
      status_code: 404,
    });
  }

  res.status(200).json({ success: true });
};

export const deleteSlackBotSummoningWhitelistHandler = withLogging(
  _deleteSlackBotSummoningWhitelistHandler
);
