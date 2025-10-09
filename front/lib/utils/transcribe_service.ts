import type { ReadStream } from "node:fs";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api/types/SpeechToTextChunkResponseModel";
import type formidable from "formidable";
import fs from "fs";

import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function getElevenLabs() {
  const credentials = dustManagedCredentials();
  return new ElevenLabsClient({ apiKey: credentials.ELEVENLABS_API_KEY });
}

const _ELEVENLABS_TRANSCRIBE_MODEL = "scribe_v1";

type FormidableFileLike = Pick<
  formidable.File,
  "filepath" | "originalFilename"
>;

async function toReadable(input: FormidableFileLike): Promise<ReadStream> {
  return fs.createReadStream(input.filepath);
}

export async function transcribeFile(
  input: FormidableFileLike
): Promise<Result<string, Error>> {
  try {
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
  } catch (err) {
    const e = normalizeError(err);
    logger.error({ err: e }, `Failed to transcribe file`);
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
  input: formidable.File
): Promise<AsyncIterable<TranscriptionStreamEvent>> {
  try {
    // Minimal implementation: ElevenLabs streaming is not wired; fall back to a single full transcript.
    const r = await transcribeFile(input);
    if (r.isErr()) {
      throw r.error;
    }
    const full = r.value;
    return (async function* () {
      yield { fullTranscript: full, type: "fullTranscript" };
    })();
  } catch (err) {
    const e = normalizeError(err);
    logger.error({ err: e }, `Failed to start streaming transcription`);
    throw e;
  }
}
