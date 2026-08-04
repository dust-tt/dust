import type {
  SlackWebhookReqBody,
  SlackWebhookResBody,
} from "@connectors/api/webhooks/slack/utils";
import { isSlackWebhookEventReqBody } from "@connectors/api/webhooks/slack/utils";
import { launchSlackWebhookEventWorkflow } from "@connectors/connectors/slack/temporal/client";
import { toWebhookEventPayload } from "@connectors/connectors/slack/temporal/webhook_event";
import mainLogger from "@connectors/logger/logger";
import {
  apiError,
  statsDClient,
  withLogging,
} from "@connectors/logger/withlogging";
import type { Request, Response } from "express";

/**
 * Slack webhook entry point. This handler runs at Slack webhook rate, so it
 * must never touch the database or the Slack API: it validates the shape of
 * the payload and starts one workflow per event, which does all the work.
 */
const _webhookSlackAPIHandler = async (
  req: Request<
    Record<string, string>,
    SlackWebhookResBody,
    SlackWebhookReqBody
  >,
  res: Response<SlackWebhookResBody>
) => {
  if (req.body.type === "url_verification" && req.body.challenge) {
    return res.status(200).send({
      challenge: req.body.challenge,
    });
  }

  if (req.body.type !== "event_callback") {
    return res.status(200).end();
  }

  if (!isSlackWebhookEventReqBody(req.body)) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required fields in request body",
      },
      status_code: 400,
    });
  }

  const { event, event_id: eventId, team_id: teamId } = req.body;
  // The event id is what makes the workflow id stable across Slack's retries,
  // so an event callback without one is not something we can dedup.
  if (!teamId || !eventId) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing team_id or event_id in request body",
      },
      status_code: 400,
    });
  }

  const logger = mainLogger.child({
    connectorType: "slack",
    slackTeamId: teamId,
  });

  const payload = toWebhookEventPayload(event);
  if (!payload) {
    // An event we do not route, or one that does not carry what its handler
    // needs. Either way Slack has nothing to retry.
    logger.info({ eventType: event.type }, "Ignoring webhook event");
    return res.status(200).end();
  }

  const launchRes = await launchSlackWebhookEventWorkflow(
    teamId,
    eventId,
    payload
  );
  if (launchRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: launchRes.error.message,
      },
    });
  }

  // Paired with slack_webhook.events_processed.count, emitted once the workflow
  // handles the event. Events queued but never processed mean the workflow is
  // wedged: nothing else notices, since we already answered 200 to Slack.
  statsDClient.increment("slack_webhook.events_queued.count", 1, [
    `event_type:${payload.type}`,
  ]);

  logger.info({ payload }, "Queued webhook event");

  return res.status(200).end();
};

export const webhookSlackAPIHandler = withLogging(_webhookSlackAPIHandler);
