import { WebClient } from "@slack/web-api";

import { getAccessTokenFromNango } from "@app/lib/labs/transcripts/utils/helpers";

const { NANGO_SLACK_CONNECTOR_ID } = process.env;

export async function getSlackClient(nangoConnectionId: string) {
  if (!NANGO_SLACK_CONNECTOR_ID) {
    throw new Error("Env var NANGO_SLACK_CONNECTOR_ID is not defined");
  }

  const slackAccessToken = await getAccessTokenFromNango(
    NANGO_SLACK_CONNECTOR_ID,
    nangoConnectionId
  );
  const slackClient = new WebClient(slackAccessToken);

  return slackClient;
}
