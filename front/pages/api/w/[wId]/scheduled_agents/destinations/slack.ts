import type { WithAPIErrorReponse } from "@dust-tt/types";
import { WebClient } from "@slack/web-api";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { getAccessTokenFromNango } from "@app/lib/labs/transcripts/utils/helpers";
import { apiError, withLogging } from "@app/logger/withlogging";

export type SlackChannelsResponseBody = {
  scheduledAgents: Array<string>;
};


async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      SlackChannelsResponseBody
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user) {
    res.status(404).end();
    return;
  }

  if (!auth.isBuilder()) {
    res.status(403).end();
    return;
  }

  if (!owner.flags.includes("scheduler")) {
    console.log("NO SCHEDULE FF")
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Not found.",
      },
    });
  }

  const { NANGO_SLACK_CONNECTOR_ID, NANGO_SLACK_CONNECTION_ID_HACKATHON } = process.env;


   async function getSlackClient(nangoConnectionId: string) {

    console.log('NANGO_SLACK_CONNECTOR_ID', NANGO_SLACK_CONNECTOR_ID)
    console.log('NANGO_SLACK_CONNECTION_ID_HACKATHON', NANGO_SLACK_CONNECTION_ID_HACKATHON)
    if (!NANGO_SLACK_CONNECTOR_ID || !NANGO_SLACK_CONNECTION_ID_HACKATHON) {
      throw new Error("Env var NANGO_SLACK_CONNECTOR_ID is not defined");
    }
  
    const slackAccessToken = await getAccessTokenFromNango(
      NANGO_SLACK_CONNECTOR_ID,
      NANGO_SLACK_CONNECTION_ID_HACKATHON
    );

    console.log('SLACK TOKEN', slackAccessToken)
    const slackClient = new WebClient(slackAccessToken);
  
    return slackClient;
  }

  console.log("STILL THERE2?")
  const slackClient = await getSlackClient(owner.sId);

  console.log("STILL THERE3?")
  const getAvailableSlackChannels = async () => { 
    try {
      const result = await slackClient.conversations.list({
        types: "public_channel",
      });
      const channels = result.channels;
      return channels;
    } catch (error) {
      console.error("Error fetching channels:", error);
      return [];
    }
  }

  console.log("STILL THERE4?")

  switch (req.method) {
    case "GET":
      const channels = await getAvailableSlackChannels();
      if(!channels) {
        // return 404
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Not found.",
          },
        });
      }
      
      const responseBody = {
        scheduledAgents: channels.map((channel) => channel.name),
      } as SlackChannelsResponseBody;

      res.status(200).json(responseBody);
      return;
      
    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
