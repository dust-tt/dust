// Transcribe service using OpenAI Whisper.
// This module exposes two methods (plus a helper):
// 1) transcribeFile: Takes a formidable file-like (filepath + originalFilename) and returns the
//    full transcript.
// 2) transcribeStream: Takes a formidable file-like and returns a readable stream of transcript
//    events from OpenAI.
// Helper: transcribeFromReadable: Takes a Node.js Readable of audio bytes and returns the same
//    transcript event stream (used for live audio ingestion, e.g., Redis-based streams).
//
// Notes:
// - This implementation targets Node.js environment where we can pass Readable streams to the
//   OpenAI SDK.
// - Streaming transcription uses the OpenAI SDK native streaming (no manual chunking) for models
//   that support server-side streaming (e.g., gpt-4o-transcribe). We do not implement client-side
//   chunking.

import type formidable from "formidable";
import fs from "fs";
import OpenAI from "openai";
import type { FileLike } from "openai/uploads";
import { toFile } from "openai/uploads";
import type { Readable } from "stream";

import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Lazy import to avoid hard dependency until used.
async function getOpenAI() {
  const credentials = dustManagedCredentials();
  return new OpenAI({ apiKey: credentials.OPENAI_API_KEY });
}

const _TRANSCRIBE_MODEL = "gpt-4o-transcribe";

type FormidableFileLike = Pick<
  formidable.File,
  "filepath" | "originalFilename"
>;

async function toFileLike(
  input: FormidableFileLike,
  fallbackName = "audio.wav"
): Promise<FileLike> {
  const stream = fs.createReadStream(input.filepath);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const name = input.originalFilename || fallbackName;
  return toFile(stream, name);
}

export async function transcribeFile(
  input: FormidableFileLike
): Promise<Result<string, Error>> {
  try {
    const openai = await getOpenAI();
    const file = await toFileLike(input);

    const text = await openai.audio.transcriptions.create({
      file,
      model: _TRANSCRIBE_MODEL,
      response_format: "text",
    });
    return new Ok(text);
  } catch (err) {
    const e = normalizeError(err);
    logger.error(
      { err: e },
      `Failed to transcribe file with ${_TRANSCRIBE_MODEL}`
    );
    return new Err(e);
  }
}

export type TranscriptionDeltaEvent = {
  delta: string;
  type: "delta";
};

export type TranscriptionFullTranscriptEvent = {
  fullTranscript: string;
  type: "fullTranscript";
};

export type TranscriptionStreamEvent =
  | TranscriptionDeltaEvent
  | TranscriptionFullTranscriptEvent;

export async function transcribeStream(
  input: FormidableFileLike
): Promise<AsyncIterable<TranscriptionStreamEvent>> {
  const openai = await getOpenAI();
  const file = await toFileLike(input);
  try {
    const evtStream = await openai.audio.transcriptions.create({
      file,
      model: _TRANSCRIBE_MODEL,
      // When true, OpenAI returns a Stream<TranscriptionStreamEvent> (SSE over HTTP).
      stream: true,
      // For streaming with gpt-4o-transcribe, response_format must be json (SDK default).
    });

    // Map OpenAI events to a simple async iterable of text deltas.
    return (async function* () {
      for await (const ev of evtStream) {
        // Two possible event types: transcript.text.delta and transcript.text.done
        switch (ev.type) {
          case "transcript.text.delta":
            yield { delta: ev.delta, type: "delta" };
            break;
          case "transcript.text.done":
            yield {
              fullTranscript: ev.text,
              type: "fullTranscript",
            };
            return;
        }
      }
    })();
  } catch (err) {
    const e = normalizeError(err);
    logger.error(
      { err: e },
      `Failed to start streaming transcription with ${_TRANSCRIBE_MODEL}`
    );
    throw e;
  }
}

export async function transcribeFromReadable(
  input: Readable
): Promise<AsyncIterable<TranscriptionStreamEvent>> {
  const openai = await getOpenAI();
  const file = await toFile(input, "live.wav");
  try {
    const evtStream = await openai.audio.transcriptions.create({
      file,
      model: _TRANSCRIBE_MODEL,
      stream: true,
    });
    return (async function* () {
      for await (const ev of evtStream) {
        switch (ev.type) {
          case "transcript.text.delta":
            yield { type: "delta", delta: ev.delta };
            break;
          case "transcript.text.done":
            yield { type: "fullTranscript", fullTranscript: ev.text };
            return;
        }
      }
    })();
  } catch (err) {
    const e = normalizeError(err);
    logger.error(
      { err: e },
      `Failed to start streaming transcription with ${_TRANSCRIBE_MODEL}`
    );
    throw e;
  }
}
