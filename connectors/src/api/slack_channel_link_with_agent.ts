import { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { APIErrorWithStatusCode } from "@connectors/lib/error";
import { SlackChannel } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";

const LinkSlackChannelWithAgentReqBodySchema = t.type({
  connectorId: t.string,
  agentConfigurationId: t.string,
});

type LinkSlackChannelWithAgentReqBody = t.TypeOf<
  typeof LinkSlackChannelWithAgentReqBodySchema
>;

type LinkSlackChannelWithAgentResBody =
  | { success: true }
  | APIErrorWithStatusCode;

const _linkSlackChannelWithAgentHandler = async (
  req: Request<
    {
      slackChannelId: string;
    },
    LinkSlackChannelWithAgentResBody,
    LinkSlackChannelWithAgentReqBody
  >,
  res: Response<LinkSlackChannelWithAgentResBody>
) => {
  if (!req.params.slackChannelId) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: slackChannelId",
      },
      status_code: 400,
    });
  }

  const { slackChannelId } = req.params;

  const bodyValidation = LinkSlackChannelWithAgentReqBodySchema.decode(
    req.body
  );

  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  const { connectorId, agentConfigurationId } = bodyValidation.right;

  const slackChannel = await SlackChannel.findOne({
    where: { connectorId, slackChannelId },
  });

  if (!slackChannel) {
    return apiError(req, res, {
      api_error: {
        type: "slack_channel_not_found",
        message: `Slack channel not found for connectorId ${connectorId} and slackChannelId ${slackChannelId}`,
      },
      status_code: 404,
    });
  }

  slackChannel.agentConfigurationId = agentConfigurationId;
  await slackChannel.save();

  res.status(200).send({
    success: true,
  });
};

export const linkSlackChannelWithAgentHandler = withLogging(
  _linkSlackChannelWithAgentHandler
);
