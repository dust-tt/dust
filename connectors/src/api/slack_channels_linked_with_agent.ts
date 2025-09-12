import type { Err } from "@dust-tt/client";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { Op } from "sequelize";

import { getChannels } from "@connectors/connectors/slack/lib/channels";
import { getSlackClient } from "@connectors/connectors/slack/lib/slack_client";
import { slackChannelIdFromInternalId } from "@connectors/connectors/slack/lib/utils";
import { launchJoinChannelWorkflow } from "@connectors/connectors/slack/temporal/client";
import { SlackChannel } from "@connectors/lib/models/slack";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";

const PatchSlackChannelsLinkedWithAgentReqBodySchema = t.type({
  agent_configuration_id: t.string,
  slack_channel_internal_ids: t.array(t.string),
  connector_id: t.string,
  auto_respond_without_mention: t.union([t.boolean, t.undefined]),
});

type PatchSlackChannelsLinkedWithAgentReqBody = t.TypeOf<
  typeof PatchSlackChannelsLinkedWithAgentReqBodySchema
>;

type PatchSlackChannelsLinkedWithAgentResBody = WithConnectorsAPIErrorReponse<{
  success: true;
}>;

const _patchSlackChannelsLinkedWithAgentHandler = async (
  req: Request<
    Record<string, string>,
    PatchSlackChannelsLinkedWithAgentResBody,
    PatchSlackChannelsLinkedWithAgentReqBody
  >,
  res: Response<PatchSlackChannelsLinkedWithAgentResBody>
) => {
  const bodyValidation = PatchSlackChannelsLinkedWithAgentReqBodySchema.decode(
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

  const {
    connector_id: connectorId,
    agent_configuration_id: agentConfigurationId,
    slack_channel_internal_ids: slackChannelInternalIds,
    auto_respond_without_mention: autoRespondWithoutMention,
  } = bodyValidation.right;

  const slackChannelIds = slackChannelInternalIds.map((s) =>
    slackChannelIdFromInternalId(s)
  );
  const slackChannels = await SlackChannel.findAll({
    where: {
      slackChannelId: slackChannelIds,
      connectorId,
    },
  });

  const channelsAlreadyLinkedToThisAgentIds = new Set(
    slackChannels
      .filter((c) => c.agentConfigurationId === agentConfigurationId)
      .map((c) => c.slackChannelId)
  );

  const foundSlackChannelIds = new Set(
    slackChannels.map((c) => c.slackChannelId)
  );

  const missingSlackChannelIds = Array.from(
    new Set(slackChannelIds.filter((id) => !foundSlackChannelIds.has(id)))
  );

  const slackClient = await getSlackClient(parseInt(connectorId));

  await withTransaction(async (t) => {
    if (missingSlackChannelIds.length) {
      const remoteChannels = (
        await getChannels(slackClient, parseInt(connectorId), false)
      ).flatMap((c) =>
        c.id && c.name
          ? [{ id: c.id, name: c.name, private: !!c.is_private }]
          : []
      );
      const remoteChannelsById = remoteChannels.reduce(
        (acc, ch) => {
          acc[ch.id] = ch;
          return acc;
        },
        {} as Record<string, { id: string; name: string; private: boolean }>
      );
      const createdChannels = await Promise.all(
        missingSlackChannelIds.map((slackChannelId) => {
          const remoteChannel = remoteChannelsById[slackChannelId];
          if (!remoteChannel) {
            throw new Error(
              `Unexpected error: Access to the Slack channel ${slackChannelId} seems lost.`
            );
          }
          return SlackChannel.create(
            {
              connectorId: parseInt(connectorId),
              slackChannelId,
              slackChannelName: remoteChannel.name,
              agentConfigurationId,
              permission: "write",
              private: remoteChannel.private,
              autoRespondWithoutMention: autoRespondWithoutMention ?? false,
            },
            {
              transaction: t,
            }
          );
        })
      );
      slackChannelIds.push(...createdChannels.map((c) => c.slackChannelId));
    }
    await SlackChannel.update(
      { agentConfigurationId: null },
      {
        where: {
          connectorId,
          agentConfigurationId,
        },
        transaction: t,
      }
    );
    await Promise.all(
      slackChannelIds.map((slackChannelId) =>
        SlackChannel.update(
          {
            agentConfigurationId,
            autoRespondWithoutMention: autoRespondWithoutMention ?? false,
          },
          { where: { connectorId, slackChannelId }, transaction: t }
        )
      )
    );
  });
  const joinPromises = await Promise.all(
    slackChannelIds
      .filter(
        (slackChannelId) =>
          !channelsAlreadyLinkedToThisAgentIds.has(slackChannelId)
      )
      .map((slackChannelId) =>
        launchJoinChannelWorkflow(
          parseInt(connectorId),
          slackChannelId,
          "join-only"
        )
      )
  );

  // If there's an error that's other than workflow already started, return it.
  const nonAlreadyStartedError = joinPromises.filter(
    (j) =>
      j.isErr() && !(j.error instanceof WorkflowExecutionAlreadyStartedError)
  )?.[0] as Err<Error> | undefined;

  if (nonAlreadyStartedError) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "connector_update_error",
        message: nonAlreadyStartedError.error.message,
      },
    });
  }

  const alreadyStartedError = joinPromises.filter(
    (j) => j.isErr() && j.error instanceof WorkflowExecutionAlreadyStartedError
  )?.[0] as Err<Error> | undefined;

  if (alreadyStartedError) {
    return apiError(req, res, {
      status_code: 409, // Conflict - operation already in progress
      api_error: {
        type: "connector_operation_in_progress",
        message: alreadyStartedError.error.message,
      },
    });
  }

  res.status(200).json({
    success: true,
  });
};

export const patchSlackChannelsLinkedWithAgentHandler = withLogging(
  _patchSlackChannelsLinkedWithAgentHandler
);

type GetSlackChannelsLinkedWithAgentResBody = WithConnectorsAPIErrorReponse<{
  slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    agentConfigurationId: string;
    autoRespondWithoutMention: boolean;
  }[];
}>;

const _getSlackChannelsLinkedWithAgentHandler = async (
  req: Request<Record<string, string>>,
  res: Response<GetSlackChannelsLinkedWithAgentResBody>
) => {
  const { connector_id: connectorId } = req.query;

  if (!connectorId || typeof connectorId !== "string") {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Missing required parameters: connector_id`,
      },
      status_code: 400,
    });
  }

  const slackChannels = await SlackChannel.findAll({
    where: {
      connectorId,
      agentConfigurationId: {
        [Op.not]: null,
      },
    },
  });

  res.status(200).json({
    slackChannels: slackChannels.map((c) => ({
      slackChannelId: c.slackChannelId,
      slackChannelName: "#" + c.slackChannelName,
      // We know that agentConfigurationId is not null because of the where clause above
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      agentConfigurationId: c.agentConfigurationId!,
      autoRespondWithoutMention: c.autoRespondWithoutMention,
    })),
  });
};

export const getSlackChannelsLinkedWithAgentHandler = withLogging(
  _getSlackChannelsLinkedWithAgentHandler
);
