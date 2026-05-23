import { findAgentsInMessage } from "@app/lib/utils/find_agents_in_message";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { transcribeStream } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type { HttpBindings } from "@hono/node-server";
import formidable from "formidable";
import { Hono } from "hono";
import { stream } from "hono/streaming";

export type PostTranscribeResponseBody = { text: string };

// Mounted at /api/w/:wId/services/transcribe.
//
// We extend the workspace context with `HttpBindings` so we can reach the
// underlying Node `IncomingMessage` via `ctx.env.incoming` and hand it to
// `formidable.parse(...)` — matching the Next handler exactly, which also
// streamed the multipart body through formidable from the raw request.
const app = new Hono<WorkspaceAwareCtx & { Bindings: HttpBindings }>();

app.post("/", async (ctx) => {
  const auth = ctx.get("auth");

  const plan = auth.getNonNullablePlan();
  if (plan.isByok) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Voice transcription is not available on this plan.",
      },
    });
  }

  const incoming = ctx.env?.incoming;
  if (!incoming) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Multipart upload is not supported in this runtime.",
      },
    });
  }

  const form = formidable({ multiples: false });
  const [, files] = await form.parse(incoming);
  const maybeFiles = files.file;

  if (!maybeFiles || maybeFiles.length !== 1) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No file uploaded",
      },
    });
  }
  const file = maybeFiles[0];

  const statsd = getStatsDClient();
  const totalStartMs = performance.now();
  const wId = auth.getNonNullableWorkspace().sId;

  ctx.header("Content-Type", "text/event-stream");
  ctx.header("Cache-Control", "no-cache");
  ctx.header("Connection", "keep-alive");
  ctx.header("X-Accel-Buffering", "no");
  ctx.header("Content-Encoding", "none");

  return stream(ctx, async (s) => {
    try {
      const transcriptStream = await transcribeStream(file);
      for await (const chunk of transcriptStream) {
        let stop = false;
        switch (chunk.type) {
          case "delta":
            await s.write(
              `data: ${JSON.stringify({ type: "delta", delta: chunk.delta })}\n\n`
            );
            break;

          case "fullTranscript": {
            const transcript = chunk.fullTranscript;

            if (!transcript) {
              await s.write(
                `data: ${JSON.stringify({ type: "error", error: "the audio was silent, please check your microphone" })}\n\n`
              );
              statsd.distribution(
                "voice_transcription.total.duration_ms",
                performance.now() - totalStartMs,
                [`status:aborted`]
              );
              return;
            } else {
              const agentFinderStartMs = performance.now();
              const fullTranscript = await findAgentsInMessage(
                auth,
                transcript
              );
              statsd.distribution(
                "voice_transcription.agent_detection.duration_ms",
                performance.now() - agentFinderStartMs,
                [`status:success`]
              );

              await s.write(
                `data: ${JSON.stringify({ type: "fullTranscript", fullTranscript })}\n\n`
              );
            }

            stop = true;
            break;
          }

          default:
            assertNever(chunk);
        }

        if (s.aborted || stop) {
          break;
        }
      }
      await s.write("data: done\n\n");

      statsd.distribution(
        "voice_transcription.total.duration_ms",
        performance.now() - totalStartMs,
        [`status:success`]
      );
    } catch (e) {
      const err = normalizeError(e);
      logger.error({ err, wId }, "Unexpected error in transcribe endpoint.");

      statsd.distribution(
        "voice_transcription.total.duration_ms",
        performance.now() - totalStartMs,
        [`status:error`]
      );

      try {
        await s.write(
          `data: ${JSON.stringify({ type: "error", error: "Failed to transcribe file. Please try again later." })}\n\n`
        );
      } catch {
        // The stream may already be closed; nothing we can do.
      }
    }
  });
});

export default app;
