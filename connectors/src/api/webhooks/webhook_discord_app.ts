import type { Request, Response } from "express";
import nacl from "tweetnacl";

import { apiConfig } from "@connectors/lib/api/config";
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

type DiscordInteractionType =
  (typeof DiscordInteraction)[keyof typeof DiscordInteraction];

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

type DiscordWebhookReqBody = {
  type: DiscordInteractionType;
  data?: {
    name?: string;
    options?: Array<{
      name: string;
      type: number;
      value?: string | number | boolean;
      options?: Array<{
        name: string;
        type: number;
        value?: string | number | boolean;
      }>;
    }>;
    custom_id?: string;
  };
  guild_id?: string;
  channel_id?: string;
  member?: {
    user?: {
      id: string;
    };
  };
  user?: {
    id: string;
  };
};

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
    interactionBody = JSON.parse(bodyString);
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

export const webhookDiscordAppHandler = withLogging(_webhookDiscordAppHandler);
