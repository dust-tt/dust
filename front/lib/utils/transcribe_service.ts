import type { ReadStream } from "node:fs";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import { dustManagedServiceCredentials } from "@app/types/api/credentials";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api/types/SpeechToTextChunkResponseModel";
import { ElevenLabsEnvironment } from "@elevenlabs/elevenlabs-js/environments";
import type formidable from "formidable";
import fs from "fs";

const TRANSCRIPTION_TIMEOUT_SECONDS = 5 * 60; // 5 minutes.

export const REGION_TO_ELEVENLABS_ENVIRONMENT = {
  "europe-west1": {
    environment: ElevenLabsEnvironment.ProductionEu,
    apiUrl: "https://api.eu.residency.elevenlabs.io",
    websocketUrl: "wss://api.eu.residency.elevenlabs.io",
  },
  "us-central1": {
    environment: ElevenLabsEnvironment.ProductionUs,
    apiUrl: "https://api.elevenlabs.io",
    websocketUrl: "wss://api.elevenlabs.io",
  },
};

export function getElevenLabs() {
  const credentials = dustManagedServiceCredentials();
  const apiKey = credentials.ELEVENLABS_API_KEY;
  const region = regionsConfig.getCurrentRegion();

  const elevenLabsEnvironment =
    REGION_TO_ELEVENLABS_ENVIRONMENT[region].environment;
  return new ElevenLabsClient({
    apiKey: apiKey,
    environment: elevenLabsEnvironment,
    timeoutInSeconds: TRANSCRIPTION_TIMEOUT_SECONDS,
  });
}

const _ELEVENLABS_TRANSCRIBE_MODEL = "scribe_v2";

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
    const el = getElevenLabs();
    const file = await toReadable(input);
    const response = (await el.speechToText.convert({
      modelId: _ELEVENLABS_TRANSCRIBE_MODEL,
      file,
      languageCode: undefined, // enable auto-detection of languages
      tagAudioEvents: false, // disable tagging of audio events
      diarize: false, // disable diarization
      enableLogging: false, // disable logging, for Zero Data Retention
      // we can safely cast here because we know the response is a SpeechToTextChunkResponseModel
    })) as SpeechToTextChunkResponseModel;

    return new Ok(response.text);
  } catch (err) {
    const e = normalizeError(err);

    logger.error({ err: e }, `Failed to transcribe file`);
    return new Err(e);
  }
}

type TranscriptionDeltaEvent = {
  delta: string;
  type: "delta";
};

type TranscriptionFullTranscriptEvent = {
  fullTranscript: string;
  type: "fullTranscript";
};

type TranscriptionStreamEvent =
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
