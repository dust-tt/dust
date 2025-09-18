import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

interface AudioChunkEvent {
  type: "audio" | "end" | "start";
  // Base64-encoded audio data when type === "audio".
  data?: string;
}

const PostLiveBody = t.type({
  type: t.union([t.literal("audio"), t.literal("end"), t.literal("start")]),
  data: t.union([t.string, t.undefined]),
});

function getAudioChannelId({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  // Use a dedicated audio channel for voice input associated to a conversation.
  return `audio-${workspaceId}-${userId}`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST": {
      // Prepare Redis publisher.
      const channel = getAudioChannelId({
        workspaceId: auth.getNonNullableWorkspace().sId,
        userId: auth.getNonNullableUser().sId,
      });
      const redis = getRedisHybridManager();

      try {
        const bodyValidation = PostLiveBody.decode(req.body);
        if (isLeft(bodyValidation)) {
          const pathError = reporter.formatValidationErrors(
            bodyValidation.left
          );
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body: ${pathError}`,
            },
          });
        }
        const { right: evt } = bodyValidation;

        await redis.publish(
          channel,
          JSON.stringify({ type: evt.type, data: evt.data }),
          "user_message_events"
        );

        res.status(200).json();
        return;
      } catch (err) {
        logger.error({ err }, "Error ingesting audio stream");
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to ingest audio stream.",
          },
        });
      }
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
