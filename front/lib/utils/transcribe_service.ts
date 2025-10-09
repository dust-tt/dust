import type { ReadStream } from "node:fs";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api/types/SpeechToTextChunkResponseModel";
import type formidable from "formidable";
import fs from "fs";
import OpenAI from "openai";
import type { FileLike } from "openai/uploads";
import { toFile } from "openai/uploads";

import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { assertNever } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Lazy import to avoid hard dependency until used.
async function getOpenAI() {
  const credentials = dustManagedCredentials();
  return new OpenAI({ apiKey: credentials.OPENAI_API_KEY });
}

async function getElevenLabs() {
  const credentials = dustManagedCredentials();
  return new ElevenLabsClient({ apiKey: credentials.ELEVENLABS_API_KEY });
}

const _OPENAI_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
const _ELEVENLABS_TRANSCRIBE_MODEL = "scribe_v1";

export type TranscriptionProvider = "openai" | "elevenlabs";

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

async function toReadable(input: FormidableFileLike): Promise<ReadStream> {
  return fs.createReadStream(input.filepath);
}

export async function transcribeFile(
  input: FormidableFileLike,
  provider: TranscriptionProvider = "openai"
): Promise<Result<string, Error>> {
  try {
    switch (provider) {
      case "openai": {
        const openai = await getOpenAI();
        const file = await toFileLike(input);
        const text = await openai.audio.transcriptions.create({
          file,
          model: _OPENAI_TRANSCRIBE_MODEL,
          response_format: "text",
        });
        return new Ok(text);
      }
      case "elevenlabs": {
        const el = await getElevenLabs();
        const file = await toReadable(input);
        const response = (await el.speechToText.convert({
          modelId: _ELEVENLABS_TRANSCRIBE_MODEL,
          file,
          languageCode: undefined, // enable auto-detection of languages
          tagAudioEvents: false, // disable tagging of audio events
          diarize: false, // disable diarization
          // we can safely cast here because we know the response is a SpeechToTextChunkResponseModel
        })) as SpeechToTextChunkResponseModel;

        return new Ok(response.text);
      }
      default: {
        assertNever(provider);
      }
    }
  } catch (err) {
    const e = normalizeError(err);
    logger.error(
      { err: e, provider },
      `Failed to transcribe file with provider ${provider}`
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
  input: formidable.File,
  provider: TranscriptionProvider = "openai"
): Promise<AsyncIterable<TranscriptionStreamEvent>> {
  const file = await toFileLike(input);
  try {
    switch (provider) {
      case "openai": {
        const openai = await getOpenAI();
        const evtStream = await openai.audio.transcriptions.create({
          file,
          model: _OPENAI_TRANSCRIBE_MODEL,
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
      }
      case "elevenlabs": {
        // Minimal implementation: ElevenLabs streaming is not wired; fall back to a single full transcript.
        const r = await transcribeFile(input, "elevenlabs");
        if (r.isErr()) {
          throw r.error;
        }
        const full = r.value;
        return (async function* () {
          yield { fullTranscript: full, type: "fullTranscript" };
        })();
      }
      default: {
        assertNever(provider);
      }
    }
  } catch (err) {
    const e = normalizeError(err);
    logger.error(
      { err: e, provider },
      `Failed to start streaming transcription with provider ${provider}`
    );
    throw e;
  }
}
