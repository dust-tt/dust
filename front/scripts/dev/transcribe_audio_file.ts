import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import {
  transcribeFile,
  transcribeStream,
} from "@app/lib/utils/transcribe_service";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
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
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This script can only be run in development.");
  }

  if (!execute) {
    logger.info({ file, stream }, "Would transcribe audio file.");
    return;
  }

  if (stream) {
    // Streaming path: we read via a file stream and yield partial transcripts as they are ready.
    logger.info({ file }, "Streaming transcription started.");
    try {
      const rs = createReadStream(file);
      let totalLength = 0;
      for await (const text of transcribeStream(rs)) {
        const t = (text ?? "").trim();
        if (t.length > 0) {
          totalLength += t.length;
          logger.info({ chunkLength: t.length }, "Transcription chunk.");
          // Emit chunk content as a separate log line to keep logs structured.
          logger.info({ transcriptChunk: t });
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
  logger.info({ file }, "Reading audio file for transcription.");

  try {
    const data = await readFile(file);
    const filename = basename(file);

    logger.info(
      { file: filename, size: data.length },
      "Transcribing audio file with Whisper."
    );

    const text = await transcribeFile({ data, filename });

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
  } catch (err) {
    const e = normalizeError(err);
    logger.error({ err: e, file }, "Failed to transcribe audio file.");
    throw e;
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
  },
  async ({ file, execute, stream }, logger) => {
    await transcribeAudioFile({ file, stream }, execute, logger);
  }
);
