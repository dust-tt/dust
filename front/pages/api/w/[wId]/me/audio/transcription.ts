import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { streamTranscribeStream } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

interface AudioChunkEvent {
  type: "audio" | "end";
  data?: string; // Base64-encoded audio data when type === "audio".
}

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
  const channel = getAudioChannelId({
    workspaceId: auth.getNonNullableWorkspace().sId,
    userId: auth.getNonNullableUser().sId,
  });

  switch (req.method) {
    case "GET": {
      // Setup SSE response headers.
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();

      // Controller to handle client disconnect.
      const controller = new AbortController();
      const { signal } = controller;
      req.on("close", () => controller.abort());

      // Prepare a Readable stream to feed audio bytes into the transcriber.
      const audioReadable = new Readable({ encoding: "ascii" });

      const { iterator, unsubscribe } =
        await getRedisHybridManager().subscribeAsAsyncIterator<AudioChunkEvent>(
          {
            channelName: channel,
            includeHistory: true,
            lastEventId: null,
            origin: "conversation_events",
          }
        );

      // Bridge Redis audio events to the Readable stream.
      // void (async () => {
      try {
        for await (const ev of iterator) {
          logger.info("Received audio event: " + ev.data?.length);
          logger.info("Received audio event: " + ev.data?.slice(0, 30));
          if (signal.aborted) {
            break;
          }
          if (ev.type === "audio" && ev.data) {
            const buf = Buffer.from(ev.data, "ascii");
            if (buf.length > 0) {
              audioReadable.push(buf);
            }
          } else if (ev.type === "end") {
            audioReadable.push(null);
            await getRedisHybridManager().clearStream(channel);
            break;
          }
        }
      } catch (e) {
        logger.error({ err: e }, "Error while reading audio events from Redis");
      } finally {
        try {
          audioReadable.push(null);
        } catch (e) {
          // Ignore double-end.
        }
      }
      // })();

      try {
        const transcript = await streamTranscribeStream(audioReadable);
        for await (const t of transcript) {
          if (signal.aborted) {
            break;
          }
          // Forward transcription events to the client via SSE.
          if (t.type === "delta") {
            const payload = { type: "delta", delta: t.delta };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } else if (t.type === "fullTranscript") {
            const payload = { type: "full_transcript", text: t.fullTranscript };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
          // @ts-expect-error - res.flush exists at runtime for streaming but types may not include it.
          res.flush();
        }
      } catch (e) {
        logger.error({ err: e }, "Error during live transcription");
        // Surface an SSE error message before closing.
        const payload = {
          type: "error",
          message: "Transcription failed.",
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        // @ts-expect-error - see comment above.
        res.flush();
      } finally {
        try {
          unsubscribe();
        } catch (e) {
          // Ignore.
        }
      }

      // Signal completion to the client and close the stream.
      res.write("data: done\n\n");
      // @ts-expect-error - see comment above.
      res.flush();
      res.status(200).end();
      return;
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler, {
  // Enable streaming for SSE and to avoid request body parsing.
  isStreaming: true,
});
