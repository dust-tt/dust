import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type formidable from "formidable";

import {
  transcribeFile,
  transcribeStream,
} from "@app/lib/utils/transcribe_service";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { assertNever, isDevelopment } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function transcribeAudioFile(
  {
    file,
    stream,
  }: {
    file: string;
    stream?: boolean;
  },
  execute: boolean,
  logger: Logger
) {
  if (!isDevelopment()) {
    throw new Error("This script can only be run in development.");
  }

  if (!execute) {
    logger.info({ file, stream }, "Would transcribe audio file.");
    return;
  }

  logger.info({ file }, "Reading audio file for transcription.");

  const data = await readFile(file);
  const filename = basename(file);
  logger.info(
    { file: filename, size: data.length },
    "Transcribing audio file."
  );

  const formidableFile = {
    filepath: file,
    originalFilename: filename,
  } as unknown as formidable.File;

  if (stream) {
    // Streaming path: we read via a file stream and yield partial transcripts as they are ready.
    logger.info({ file }, "Streaming transcription started.");
    let totalLength = 0;
    try {
      for await (const event of await transcribeStream(formidableFile)) {
        switch (event.type) {
          case "delta":
            totalLength += event.delta.length;
            logger.info(
              { chunkLength: event.delta.length },
              "Transcription chunk."
            );
            // Emit chunk content as a separate log line to keep logs structured.
            logger.info({ transcriptChunk: event.delta });
            break;

          case "fullTranscript":
            break;

          default:
            assertNever(event);
        }
      }
      logger.info({ file, totalLength }, "Streaming transcription completed.");
    } catch (err) {
      const e = normalizeError(err);
      logger.error({ err: e, file }, "Failed during streaming transcription.");
      throw e;
    }
    return;
  }

  // Non-streaming path
  const transcribeResult = await transcribeFile(formidableFile);
  if (transcribeResult.isErr()) {
    logger.error(
      { err: transcribeResult.error, file },
      "Failed to transcribe audio file."
    );
    throw transcribeResult.error;
  }

  const text = transcribeResult.value;
  if (text && text.trim().length > 0) {
    // Log the transcript. Keep as info so it is captured by the app logger (GEN8).
    logger.info(
      { file: filename, length: text.length },
      "Transcription completed."
    );
    // Emit transcript as a separate log entry to keep logs structured.
    logger.info({ transcript: text });
  } else {
    logger.warn(
      { file: filename },
      "Transcription completed but returned empty text."
    );
  }
}

makeScript(
  {
    file: {
      type: "string",
      demandOption: true,
      description: "The file to transcribe",
    },
    stream: {
      type: "boolean",
      default: false,
      description:
        "Use streaming transcription (transcribeStream) and log chunks as they arrive.",
    },
    provider: {
      type: "string",
      choices: ["openai", "elevenlabs"],
      default: "openai",
      description: "The provider to use for transcription",
    },
  },
  async ({ file, execute, stream }, logger) => {
    await transcribeAudioFile({ file, stream }, execute, logger);
  }
);
