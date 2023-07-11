import { WebClient } from "@slack/web-api";

import logger from "@app/logger/logger";

export const EXPLORATIONS_LOGGER_CHANNEL_ID = "C05G9QH1A06"; // #explorations-logger
const { SLACK_LOGGER_ACCESS_TOKEN = "" } = process.env;
let SLACK_CLIENT: WebClient | undefined;

export function getSlackClient() {
  if (SLACK_CLIENT) {
    return SLACK_CLIENT;
  }
  const slackAccessToken = SLACK_LOGGER_ACCESS_TOKEN;
  if (!slackAccessToken) {
    logger.error("SLACK_LOGGER_ACCESS_TOKEN is not defined");
  }

  const slackClient = new WebClient(slackAccessToken);
  SLACK_CLIENT = slackClient;

  return slackClient;
}

type LogOnSlackParamsType = {
  message?: string;
  blocks?: any[];
  channelID?: string;
};

export async function logOnSlack({
  message,
  blocks,
  channelID,
}: LogOnSlackParamsType): Promise<void> {
  const slackClient = getSlackClient();
  if (!channelID) {
    channelID = EXPLORATIONS_LOGGER_CHANNEL_ID;
  }
  if (!message && !blocks) {
    logger.error(
      "You must provide a message or blocks to log something on slack."
    );
  }

  const response = await slackClient.chat.postMessage({
    channel: channelID,
    text: message,
    blocks: blocks,
  });
  if (!response.ok) {
    logger.error(
      `Error logging message in channel ${channelID}: `,
      response.error
    );
  }
}
