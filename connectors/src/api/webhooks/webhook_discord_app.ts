import type { Request, Response } from "express";
import nacl from "tweetnacl";
import z from "zod";

import { sendMessageToAgent } from "@connectors/api/webhooks/discord/bot";
import {
  DISCORD_API_BASE_URL,
  formatAgentsList,
  getAvailableAgents,
  getConnectorFromGuildId,
} from "@connectors/api/webhooks/discord/utils";
import { apiConfig } from "@connectors/lib/api/config";
import {
  findBestAgentMatch,
  processMessageForMention,
} from "@connectors/lib/bot/mentions";
import mainLogger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

/**
 * Discord Interaction Types (incoming requests)
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object-interaction-type
 */
const DiscordInteraction = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

/**
 * Discord Interaction Response Types (outgoing responses)
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#responding-to-an-interaction
 */
const DiscordInteractionResponse = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
  PREMIUM_REQUIRED: 10,
} as const;

type DiscordInteractionResponseType =
  (typeof DiscordInteractionResponse)[keyof typeof DiscordInteractionResponse];

const logger = mainLogger.child(
  {
    provider: "discord_app",
    service: "discord_app",
  },
  {
    msgPrefix: "[Discord App] ",
  }
);

const DiscordWebhookReqBodySchema = z.object({
  type: z.number(),
  token: z.string(),
  data: z
    .object({
      name: z.string().optional(),
      options: z
        .array(
          z.object({
            name: z.string(),
            type: z.number(),
            value: z.union([z.string(), z.number(), z.boolean()]).optional(),
            options: z
              .array(
                z.object({
                  name: z.string(),
                  type: z.number(),
                  value: z
                    .union([z.string(), z.number(), z.boolean()])
                    .optional(),
                })
              )
              .optional(),
          })
        )
        .optional(),
      custom_id: z.string().optional(),
    })
    .optional(),
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  member: z
    .object({
      user: z
        .object({
          id: z.string(),
          username: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  user: z
    .object({
      id: z.string(),
      username: z.string().optional(),
    })
    .optional(),
});

type DiscordWebhookReqBody = z.infer<typeof DiscordWebhookReqBodySchema>;

type DiscordWebhookResBody =
  | WithConnectorsAPIErrorReponse<null>
  | {
      type: DiscordInteractionResponseType;
      data?: { content: string };
    };

/**
 * Validates Discord webhook signature using Ed25519.
 * Specified in the Discord documentation: https://discord.com/developers/docs/interactions/overview#preparing-for-interactions
 * @param signature - X-Signature-Ed25519 header value
 * @param timestamp - X-Signature-Timestamp header value
 * @param body - Raw request body as string
 * @param publicKey - Discord application public key (hex string)
 * @returns true if signature is valid, false otherwise
 */
function validateDiscordSignature(
  signature: string,
  timestamp: string,
  body: string,
  publicKey: string
): boolean {
  try {
    const isVerified = nacl.sign.detached.verify(
      new Uint8Array(Buffer.from(timestamp + body)),
      new Uint8Array(Buffer.from(signature, "hex")),
      new Uint8Array(Buffer.from(publicKey, "hex"))
    );
    return isVerified;
  } catch (error) {
    logger.error(
      { error, signature, timestamp, publicKey },
      "Error validating Discord signature"
    );
    return false;
  }
}

async function handleListAgentsCommand(
  interactionBody: DiscordWebhookReqBody,
  guildId: string,
  userId: string | undefined
): Promise<void> {
  logger.info(
    {
      userId,
      channelId: interactionBody.channel_id,
      guildId,
    },
    "List-dust-agents command called"
  );

  const connectorResult = await getConnectorFromGuildId(guildId, logger);
  if (connectorResult.isErr()) {
    await sendDiscordFollowUp(interactionBody, connectorResult.error.message);
    return;
  }

  const connector = connectorResult.value;

  // Discord doesn't provide email directly in slash commands. You would need to implement a
  // separate user mapping system if you want to filter agents based on user permissions.
  const agentsResult = await getAvailableAgents(connector, logger);

  if (agentsResult.isErr()) {
    logger.error(
      { error: agentsResult.error, guildId, connectorId: connector.id },
      "Failed to get available agents"
    );
    await sendDiscordFollowUp(
      interactionBody,
      "Error retrieving agents. Please try again later."
    );
    return;
  }

  const responseContent = formatAgentsList(agentsResult.value);
  await sendDiscordFollowUp(interactionBody, responseContent);
}

async function handleAskAgentCommand(
  interactionBody: DiscordWebhookReqBody,
  guildId: string,
  channelId: string
): Promise<void> {
  const options = interactionBody.data?.options;
  const agentName = options?.find((opt) => opt.name === "agent_name")?.value;
  const message = options?.find((opt) => opt.name === "message")?.value;
  if (
    !agentName ||
    typeof agentName !== "string" ||
    !message ||
    typeof message !== "string"
  ) {
    await sendDiscordFollowUp(
      interactionBody,
      "Missing required parameters: agent_name and message."
    );
    return;
  }

  const connectorResult = await getConnectorFromGuildId(guildId, logger);
  if (connectorResult.isErr()) {
    await sendDiscordFollowUp(interactionBody, connectorResult.error.message);
    return;
  }

  const connector = connectorResult.value;

  const agentsResult = await getAvailableAgents(connector, logger);
  if (agentsResult.isErr()) {
    logger.error(
      { error: agentsResult.error, guildId, connectorId: connector.id },
      "Failed to get available agents"
    );
    await sendDiscordFollowUp(
      interactionBody,
      "Error retrieving agents. Please try again later."
    );
    return;
  }

  const activeAgentConfigurations = agentsResult.value.filter(
    (ac) => ac.status === "active"
  );

  const agent = findBestAgentMatch(agentName, activeAgentConfigurations);

  if (!agent) {
    await sendDiscordFollowUp(
      interactionBody,
      `Agent "${agentName}" not found. Use /list-dust-agents to see available agents.`
    );
    return;
  }

  const mentionResult = processMessageForMention({
    message,
    activeAgentConfigurations,
  });

  if (mentionResult.isErr()) {
    await sendDiscordFollowUp(interactionBody, mentionResult.error.message);
    return;
  }

  const username =
    interactionBody.member?.user?.username || interactionBody.user?.username;
  const result = await sendMessageToAgent({
    agentConfiguration: agent,
    connector,
    channelId,
    discordUsername: username || "Unknown User",
    message: mentionResult.value.processedMessage,
    interactionToken: interactionBody.token,
    logger,
  });

  if (result.isErr()) {
    logger.error(
      { error: result.error, agentId: agent.sId, connectorId: connector.id },
      "Failed to send message to agent"
    );
    await sendDiscordFollowUp(
      interactionBody,
      "An error occurred while processing your message. Please try again later."
    );
  }
}

const _webhookDiscordAppHandler = async (
  req: Request<
    Record<string, string>,
    DiscordWebhookResBody,
    DiscordWebhookReqBody
  >,
  res: Response<DiscordWebhookResBody>
) => {
  const signature = req.get("X-Signature-Ed25519");
  const timestamp = req.get("X-Signature-Timestamp");
  const publicKey = apiConfig.getDiscordAppPublicKey();

  if (!signature || !timestamp || !publicKey) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required Discord security headers or public key",
      },
      status_code: 401,
    });
  }

  const bodyString = await parseExpressRequestRawBody(req);
  const isValidSignature = validateDiscordSignature(
    signature,
    timestamp,
    bodyString,
    publicKey
  );

  if (!isValidSignature) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request signature",
      },
      status_code: 401,
    });
  }

  let interactionBody: DiscordWebhookReqBody;
  try {
    const parsedBody = JSON.parse(bodyString);
    const validationResult = DiscordWebhookReqBodySchema.safeParse(parsedBody);

    if (!validationResult.success) {
      logger.error(
        { error: validationResult.error, bodyString },
        "Invalid Discord webhook body schema"
      );
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: "Invalid request body schema",
        },
        status_code: 400,
      });
    }

    interactionBody = validationResult.data;
  } catch (error) {
    logger.error({ error, bodyString }, "Failed to parse Discord webhook body");
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Invalid JSON in request body",
      },
      status_code: 400,
    });
  }

  // Discord webhook verification - respond to ping
  if (interactionBody.type === DiscordInteraction.PING) {
    logger.info("Discord ping received, responding with pong");
    return res.status(200).json({
      type: DiscordInteractionResponse.PONG,
    });
  }

  // Handle application commands (slash commands).
  if (interactionBody.type === DiscordInteraction.APPLICATION_COMMAND) {
    const commandName = interactionBody.data?.name;
    const guildId = interactionBody.guild_id;
    const userId = interactionBody.user?.id || interactionBody.member?.user?.id;

    if (!guildId) {
      return res.status(200).json({
        type: DiscordInteractionResponse.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "This command can only be used in a Discord server.",
        },
      });
    }

    if (commandName === "list-dust-agents") {
      // Send deferred response immediately to avoid timeout.
      const deferredResponse = res.status(200).json({
        type: DiscordInteractionResponse.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });

      // Process the command asynchronously.
      setImmediate(async () => {
        await handleListAgentsCommand(interactionBody, guildId, userId);
      });

      return deferredResponse;
    }

    if (commandName === "ask-dust-agent") {
      const channelId = interactionBody.channel_id;
      if (!channelId) {
        return res.status(200).json({
          type: DiscordInteractionResponse.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Channel ID is required.",
          },
        });
      }
      const deferredResponse = res.status(200).json({
        type: DiscordInteractionResponse.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });

      setImmediate(async () => {
        await handleAskAgentCommand(interactionBody, guildId, channelId);
      });

      return deferredResponse;
    }

    logger.warn(
      { commandName },
      "Unknown Discord application command received"
    );
    return res.status(200).json({
      type: DiscordInteractionResponse.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Unknown command: \`${commandName}\``,
      },
    });
  }

  // Default response for unsupported interaction types
  return res.status(200).json({
    type: DiscordInteractionResponse.PONG,
  });
};

async function parseExpressRequestRawBody(req: Request): Promise<string> {
  if ("rawBody" in req && req.rawBody) {
    return req.rawBody.toString();
  }

  throw new Error("Raw body not available for signature verification");
}

/**
 * Send a follow-up message to Discord after a deferred response.
 */
async function sendDiscordFollowUp(
  interactionBody: DiscordWebhookReqBody,
  content: string
): Promise<void> {
  const botToken = apiConfig.getDiscordBotToken();
  const applicationId = apiConfig.getDiscordApplicationId();

  if (!botToken || !applicationId) {
    logger.error("Discord bot token or application ID not configured");
    return;
  }

  const url = `${DISCORD_API_BASE_URL}/webhooks/${applicationId}/${interactionBody.token}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        },
        "Failed to send Discord follow-up message"
      );
    }
  } catch (error) {
    logger.error({ error }, "Error sending Discord follow-up message");
  }
}

export const webhookDiscordAppHandler = withLogging(_webhookDiscordAppHandler);
