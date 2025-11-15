import type { RealtimeConnection } from "@elevenlabs/elevenlabs-js";
import {
  AudioFormat,
  CommitStrategy,
  RealtimeEvents,
} from "@elevenlabs/elevenlabs-js";
import formidable from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { getElevenLabsClient } from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { findAgentsInMessage } from "@app/lib/utils/find_agents_in_message";
import { transcribeStream } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { assertNever } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const config = {
  api: {
    // We need the raw request stream for streaming audio and for formidable to parse multipart.
    bodyParser: false,
  },
};

export type PostTranscribeResponseBody = { text: string };

async function streamRealtimeTranscription(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator,
  sessionId: string,
  workspaceId: string
) {
  try {
    // Verify session exists in Redis
    const redis = await getRedisClient({ origin: "transcription_session" });
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

    if (metadata.workspaceId !== workspaceId) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Session does not belong to this workspace.",
        },
      });
    }

    // Set up SSE response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Create AbortController for cleanup
    const controller = new AbortController();
    const { signal } = controller;

    req.on("close", () => {
      controller.abort();
    });

    // Connect to ElevenLabs Scribe Realtime WebSocket
    const elevenLabs = getElevenLabsClient();
    const connection = await elevenLabs.speechToText.realtime.connect({
      modelId: "scribe_realtime_v2",
      languageCode: "auto",
      commitStrategy: CommitStrategy.VAD,
      sampleRate: 16_000,
      audioFormat: AudioFormat.PCM_16000,
    });

    let isConnected = false;
    let processingQueue = true;

    connection.on(RealtimeEvents.OPEN, () => {
      logger.info({ sessionId }, "[ElevenLabs] Connected to Scribe Realtime");
      isConnected = true;

      // Start processing audio chunks from Redis
      processAudioQueue(
        redis,
        sessionId,
        connection,
        signal,
        () => processingQueue
      ).catch((err) => {
        logger.error(
          { err, sessionId },
          "[ElevenLabs] Error processing audio queue"
        );
        connection.close();
      });
    });

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (message: any) => {
      logger.info(
        { sessionId, message },
        "[ElevenLabs] Partial transcript received"
      );
      res.write(
        `data: ${JSON.stringify({
          type: "delta",
          delta: message.text || "",
        })}\n\n`
      );
      // @ts-expect-error - flush exists but not in types
      res.flush();
    });

    connection.on(RealtimeEvents.FINAL_TRANSCRIPT, async (message: any) => {
      logger.info(
        { sessionId, message },
        "[ElevenLabs] Final transcript received"
      );
      const fullTranscript = await findAgentsInMessage(
        auth,
        message.text || ""
      );

      res.write(
        `data: ${JSON.stringify({
          type: "fullTranscript",
          fullTranscript,
        })}\n\n`
      );
      // @ts-expect-error - flush exists but not in types
      res.flush();
    });

    connection.on(RealtimeEvents.ERROR, (message: any) => {
      logger.error({ sessionId, message }, "[ElevenLabs] Error received");
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: message.message || "Transcription error",
        })}\n\n`
      );
      // @ts-expect-error - flush exists but not in types
      res.flush();
    });

    connection.on(RealtimeEvents.CLOSE, () => {
      logger.info({ sessionId }, "[ElevenLabs] WebSocket closed");
      processingQueue = false;
      res.write("data: done\n\n");
      // @ts-expect-error - flush exists but not in types
      res.flush();
      res.end();
    });

    connection.on(RealtimeEvents.SESSION_STARTED, () => {
      logger.info({ sessionId }, "[ElevenLabs] Scribe session started");
    });

    signal.addEventListener("abort", () => {
      if (isConnected) {
        connection.close();
      }
      processingQueue = false;
    });
  } catch (error) {
    logger.error(
      { error, sessionId },
      "[ElevenLabs] Error in realtime transcription"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to start realtime transcription.",
      },
    });
  }
}

async function processAudioQueue(
  redis: Awaited<ReturnType<typeof getRedisClient>>,
  sessionId: string,
  connection: RealtimeConnection,
  signal: AbortSignal,
  isProcessing: () => boolean
): Promise<void> {
  const queueKey = `session:${sessionId}:audio`;

  while (isProcessing() && !signal.aborted) {
    try {
      // Non-blocking pop with timeout
      const result = await redis.blPop(queueKey, 0.1);

      if (result) {
        const audioBase64 = result.element;

        // Send audio to ElevenLabs
        connection.send({ audioBase64 });
      }
    } catch (err) {
      logger.error({ err, sessionId }, "Error reading from Redis queue");
      break;
    }
  }

  connection.commit();
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostTranscribeResponseBody | void>>,
  auth: Authenticator
) {
  const { wId, sessionId } = req.query;
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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
    return;
  }

  // Check if this is a realtime session request
  if (sessionId && typeof sessionId === "string") {
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

    return streamRealtimeTranscription(req, res, auth, sessionId, wId);
  }

  const form = formidable({ multiples: false });
  const [, files] = await form.parse(req);
  const maybeFiles = files.file;

  if (!maybeFiles || maybeFiles.length !== 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No file uploaded",
      },
    });
  }
  const file = maybeFiles[0];

  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Create an AbortController to handle client disconnection
    const controller = new AbortController();
    const { signal } = controller;

    // Handle client disconnection
    req.on("close", () => {
      controller.abort();
    });

    const stream = await transcribeStream(file);
    for await (const chunk of stream) {
      let stop = false;
      switch (chunk.type) {
        case "delta":
          res.write(
            `data: ${JSON.stringify({ type: "delta", delta: chunk.delta })}\n\n`
          );
          // @ts-expect-error - We need it for streaming, but it does not exist in the types.
          res.flush();
          break;

        case "fullTranscript":
          const transcript = chunk.fullTranscript;

          if (!transcript) {
            res.write(
              `data: ${JSON.stringify({ type: "error", error: "the audio was silent, please check your microphone" })}\n\n`
            );
            res.end();
            return;
          } else {
            const fullTranscript = await findAgentsInMessage(auth, transcript);

            res.write(
              `data: ${JSON.stringify({ type: "fullTranscript", fullTranscript })}\n\n`
            );
          }

          stop = true;
          break;

        default:
          assertNever(chunk);
      }

      if (signal.aborted || stop) {
        break;
      }
    }
    res.write("data: done\n\n");
    // @ts-expect-error - We need it for streaming, but it does not exist in the types.
    res.flush();

    res.end();
  } catch (e) {
    const err = normalizeError(e);
    logger.error({ err, wId }, "Unexpected error in transcribe endpoint.");
    res.status(500).json({
      error: {
        type: "internal_server_error",
        message: "Failed to transcribe file. Please try again later.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
