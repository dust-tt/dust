// Transcribe service using OpenAI Whisper.
// This module exposes two methods:
// 1) transcribeFile: Takes an audio file/blob/buffer/stream and returns the full transcript.
// 2) transcribeStream: Takes a Node.js Readable stream of audio and yields transcript chunks.
//
// Notes:
// - This implementation targets Node.js environment where we can pass Readable streams to the
//   OpenAI SDK.
// - Streaming transcription is emulated by chunking the input audio and performing sequential
//   partial transcriptions. Whisper does not provide true server-side streaming transcription via
//   the OpenAI public API, so we simulate it by chunking. This keeps the implementation simple
//   (GEN2) while providing incremental output.
// - We avoid parameter mutation (GEN5), avoid console.* (GEN8) in favor of logger, and follow
//   error handling guidance using normalizeError (ERR2).

import type { Readable } from "node:stream";
import { PassThrough } from "node:stream";

import OpenAI from "openai";
import type { FileLike } from "openai/uploads";
import { toFile } from "openai/uploads";

import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// We avoid enums, using type unions instead (GEN3).
export type TranscribeInput =
  | Buffer
  | ArrayBuffer
  | Readable
  | { data: Buffer | ArrayBuffer; filename?: string; mimeType?: string };

interface TranscribeStreamOptions {
  // Chunk length in seconds for simulated streaming. Larger chunks reduce API calls but increase
  // latency before text appears.
  chunkSeconds?: number;
  // Audio mime type (e.g., "audio/mpeg", "audio/wav"). Used for chunk file naming hints.
  mimeType?: string;
}

// Lazy import to avoid hard dependency until used.
async function getOpenAI() {
  const credentials = dustManagedCredentials();
  return new OpenAI({ apiKey: credentials.OPENAI_API_KEY });
}

const _WHISPER_MODEL = "whisper-1";

async function toFileLike(
  input: TranscribeInput,
  fallbackName = "audio.wav"
): Promise<{ file: FileLike }> {
  if (input instanceof Buffer) {
    const blob = new Blob([input]);
    const file = await toFile(blob, fallbackName);
    return { file };
  }

  if (input instanceof ArrayBuffer) {
    const blob = new Blob([input]);
    const file = await toFile(blob, fallbackName);
    return { file };
  }

  if (isReadable(input)) {
    // Wrap the Readable with a filename using toFile so the SDK forms multipart correctly.
    const file = await toFile(input, fallbackName);
    return { file };
  }

  const typedInput = input as {
    data: Buffer | ArrayBuffer;
    filename?: string;
    mimeType?: string;
  };
  const file = await toFile(
    new Blob([typedInput.data]),
    typedInput.filename || fallbackName
  );
  return { file };
}

function isReadable(x: unknown): x is Readable {
  return (
    x != null &&
    typeof x === "object" &&
    "pipe" in x &&
    typeof (x as { pipe: unknown }).pipe === "function"
  );
}

export async function transcribeFile(
  input: TranscribeInput
): Promise<Result<string, Error>> {
  try {
    const openai = await getOpenAI();
    const { file } = await toFileLike(input);

    const text = await openai.audio.transcriptions.create({
      file,
      model: _WHISPER_MODEL,
      response_format: "text",
    });
    return new Ok(text);
  } catch (err) {
    const e = normalizeError(err);
    logger.error({ err: e }, "Failed to transcribe file with Whisper");
    return new Err(e);
  }
}

export async function transcribeStream(
  input: Readable,
  opts?: TranscribeStreamOptions
): Promise<Result<AsyncIterable<string>, Error>> {
  try {
    // Simulate streaming by chunking audio bytes by size approximating chunkSeconds.
    const chunkSeconds = opts?.chunkSeconds ?? 15;
    const mimeType = opts?.mimeType ?? "audio/wav";

    // Heuristic bitrate for PCM/wav is ~256kbps; for mp3 could be 128kbps. Since we do not know the
    // actual bitrate, we aim for ~192kbps. 192 kbps = 24 KB/s. So for N seconds, we target N*24KB.
    // This is a rough approximation; Whisper is robust to chunking but boundaries may split words.
    const approxBytesPerSecond = 24 * 1024; // 24KB/s
    const targetChunkSize = Math.max(1, chunkSeconds) * approxBytesPerSecond;

    const openai = await getOpenAI();

    const generator = async function* (): AsyncIterable<string> {
      let buffer = Buffer.alloc(0);
      const passthrough = new PassThrough();
      input.pipe(passthrough);

      for await (const chunk of passthrough) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        buffer = Buffer.concat([buffer, b]);

        if (buffer.length >= targetChunkSize) {
          const toSend = buffer.subarray(0, targetChunkSize);
          buffer = buffer.subarray(targetChunkSize);
          const text = await transcribeChunk(openai, toSend, mimeType);
          if (text) {
            yield text;
          }
        }
      }

      // Flush remaining bytes.
      if (buffer.length > 0) {
        const text = await transcribeChunk(openai, buffer, mimeType);
        if (text) {
          yield text;
        }
      }
    };

    return new Ok(generator());
  } catch (err) {
    const e = normalizeError(err);
    logger.error(
      { err: e },
      "Failed to initialize streaming transcription with Whisper"
    );
    return new Err(e);
  }
}

async function transcribeChunk(
  openai: OpenAI,
  audio: Buffer,
  mimeType: string
): Promise<string> {
  try {
    const blob = new Blob([audio], { type: mimeType });
    const file = await toFile(blob);
    return await openai.audio.transcriptions.create({
      file,
      model: _WHISPER_MODEL,
      response_format: "text",
    });
  } catch (err) {
    const e = normalizeError(err);
    logger.error({ err: e }, "Failed to transcribe audio chunk with Whisper");
    // Keep streaming resilient: return an empty string on error for a chunk.
    return "";
  }
}
