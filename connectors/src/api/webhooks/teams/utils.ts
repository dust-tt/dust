import tracer from "dd-trace";
import type { Request, Response } from "express";

import { botAnswerTeamsMessage } from "@connectors/connectors/teams/bot";
import type { Logger } from "@connectors/logger/logger";
import { apiError } from "@connectors/logger/withlogging";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

export interface TeamsActivity {
  type: string;
  id?: string;
  timestamp?: string;
  channelId: string;
  from: {
    id: string;
    name?: string;
    aadObjectId?: string;
  };
  conversation: {
    id: string;
    name?: string;
    conversationType?: string;
    tenantId?: string;
  };
  recipient?: {
    id: string;
    name?: string;
  };
  text?: string;
  textFormat?: string;
  locale?: string;
  replyToId?: string;
}

export type TeamsWebhookReqBody = {
  type: string;
  tenantId: string;
  activity: TeamsActivity;
};

export type TeamsWebhookEventReqBody = TeamsWebhookReqBody & {
  activity: TeamsActivity;
};

export type TeamsWebhookResBody = WithConnectorsAPIErrorReponse<Record<string, never> | null>;

export function isTeamsWebhookEventReqBody(
  body: TeamsWebhookReqBody
): body is TeamsWebhookEventReqBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "activity" in body &&
    "type" in body &&
    "tenantId" in body
  );
}

export const withTeamsTrace =
  <T = typeof handleTeamsChatBot>(tags: tracer.SpanOptions["tags"]) =>
  (fn: T) =>
    tracer.wrap(
      "teams.webhook.message.handleChatBot",
      {
        type: "webhook",
        tags,
      },
      fn
    );

export async function handleTeamsChatBot(
  req: Request,
  res: Response,
  logger: Logger,
  connector: ConnectorResource
) {
  const { activity } = req.body;

  const teamsMessage = activity.text;
  const tenantId = req.body.tenantId;
  const conversationId = activity.conversation.id;
  const userId = activity.from.id;
  const userAadObjectId = activity.from.aadObjectId;
  const activityId = activity.id;
  const channelId = activity.channelId;
  const replyToId = activity.replyToId || null;

  logger.info(
    {
      activity: {
        conversationId: conversationId,
        tenantId: tenantId,
        userId: userId,
        channelId: channelId,
      },
    },
    "Processing Teams message"
  );

  if (
    !teamsMessage ||
    !tenantId ||
    !conversationId ||
    !userId ||
    !activityId
  ) {
    logger.error(
      {
        teamsMessage,
        tenantId,
        conversationId,
        userId,
        activityId,
      },
      "Missing required fields in request body"
    );
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required fields in request body",
      },
      status_code: 400,
    });
  }

  // We need to answer 200 quickly to Teams, otherwise they will retry the HTTP request.
  res.status(200).send();
  
  const params = {
    tenantId,
    conversationId,
    userId,
    userAadObjectId,
    activityId,
    channelId,
    replyToId,
  };

  const botRes = await botAnswerTeamsMessage(teamsMessage, params, connector);
  if (botRes.isErr()) {
    logger.error(
      {
        error: botRes.error,
        ...params,
      },
      "Failed to answer to Teams message"
    );
  }
}