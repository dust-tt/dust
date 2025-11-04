import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import { promisify } from "util";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export const config = {
  api: {
    bodyParser: false,
  },
};

type TranscriptionSessionResponse = {
  sessionId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<TranscriptionSessionResponse | void>
  >,
  auth: Authenticator
) {
  const { wId } = req.query;
  if (!wId || typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The request query is invalid, expects { workspaceId: string }.",
      },
    });
  }

  // Check feature flag
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("realtime_voice_transcription")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Real-time voice transcription is not enabled.",
      },
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  // Check if this is a session creation or audio chunk upload
  const sessionIdHeader = req.headers["x-session-id"];

  if (sessionIdHeader && typeof sessionIdHeader === "string") {
    // This is an audio chunk for an existing session
    return handleAudioChunk(req, res, sessionIdHeader, wId);
  }

  // Generate a unique session ID for this transcription session
  const sessionId = `transcription:${wId}:${Date.now()}:${Math.random().toString(36).substring(7)}`;

  try {
    // Create session metadata in Redis
    const redis = await getRedisClient({
      origin: "transcription_session",
    });

    await redis.setEx(
      `session:${sessionId}:metadata`,
      60 * 5, // 5 minute TTL
      JSON.stringify({
        workspaceId: wId,
        created: Date.now(),
      })
    );

    logger.info(
      { sessionId, workspaceId: wId },
      "Transcription session created"
    );

    // Respond with session ID
    res.status(200).json({ sessionId });
  } catch (error) {
    logger.error(
      { error, sessionId, workspaceId: wId },
      "Session creation error"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create transcription session.",
      },
    });
  }
}

async function handleAudioChunk(
  req: NextApiRequest,
  res: NextApiResponse,
  sessionId: string,
  workspaceId: string
) {
  try {
    // Check if session exists in Redis
    const redis = await getRedisClient({
      origin: "transcription_session",
    });
    const metadataStr = await redis.get(`session:${sessionId}:metadata`);

    if (!metadataStr) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "internal_server_error",
          message: "Transcription session not found or expired.",
        },
      });
    }

    const metadata = JSON.parse(metadataStr) as {
      workspaceId: string;
      created: number;
    };

    // Verify workspace matches
    if (metadata.workspaceId !== workspaceId) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Session does not belong to this workspace.",
        },
      });
    }

    // Collect raw body using stream pipeline
    let rawBody = Buffer.from("");
    const collector = new Writable({
      write(chunk, encoding, callback) {
        rawBody = Buffer.concat([rawBody, chunk]);
        callback();
      },
    });
    await promisify(pipeline)(req, collector);

    await redis.rPush(`session:${sessionId}:audio`, rawBody.toString("base64"));

    // Set TTL on the audio list
    await redis.expire(`session:${sessionId}:audio`, 60 * 5);

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error, sessionId }, "Error handling audio chunk");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to process audio chunk.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
