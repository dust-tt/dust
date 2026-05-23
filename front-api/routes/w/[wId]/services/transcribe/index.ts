import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findAgentsInMessage } from "@app/lib/utils/find_agents_in_message";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { transcribeStream } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import type formidable from "formidable";
import { stream } from "hono/streaming";

export type PostTranscribeResponseBody = { text: string };

// Mounted at /api/w/:wId/services/transcribe.
const app = workspaceApp();

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

  let parsed: Record<string, unknown>;
  try {
    parsed = await ctx.req.parseBody({ all: true });
  } catch (err) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `File upload failed: ${normalizeError(err).message}`,
      },
    });
  }

  const rawFile = parsed.file;
  const blob =
    rawFile instanceof File
      ? rawFile
      : Array.isArray(rawFile) &&
          rawFile.length === 1 &&
          rawFile[0] instanceof File
        ? rawFile[0]
        : null;

  if (!blob) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "No file uploaded",
      },
    });
  }

  // Persist the blob to a tmp dir so the existing lib code (which reads from
  // formidable.File.filepath) can keep working unchanged.
  const tmpDir = await mkdtemp(join(tmpdir(), "transcribe-"));
  const filepath = join(tmpDir, "upload");
  const buffer = Buffer.from(await blob.arrayBuffer());
  await writeFile(filepath, buffer);
  const file = {
    filepath,
    originalFilename: blob.name ?? null,
    size: blob.size,
    newFilename: "upload",
    mimetype: blob.type || null,
    hash: null,
    hashAlgorithm: false,
    mtime: null,
    toJSON: () => ({}) as never,
    toString: () => filepath,
  } as unknown as formidable.File;

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
