import { createReadStream } from "node:fs";
import { basename } from "node:path";

import type { RealtimeConnection } from "@elevenlabs/elevenlabs-js";
import { AudioFormat } from "@elevenlabs/elevenlabs-js";
import { CommitStrategy } from "@elevenlabs/elevenlabs-js";
import { RealtimeEvents } from "@elevenlabs/elevenlabs-js";

import { getElevenLabsClient } from "@app/lib/actions/mcp_internal_actions/servers/elevenlabs/utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { isDevelopment } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

interface RunArgs {
  file: string;
  sampleRate: number;
  commitStrategy: "VAD" | "MANUAL";
}

async function run(
  { file, sampleRate, commitStrategy }: RunArgs,
  execute: boolean,
  logger: Logger
) {
  if (!isDevelopment()) {
    throw new Error("This script can only be run in development.");
  }

  if (!execute) {
    logger.info(
      { file, sampleRate, commitStrategy },
      "Would start ElevenLabs realtime transcription."
    );
    return;
  }

  const filename = basename(file);
  logger.info(
    { file: filename, sampleRate, commitStrategy },
    "Connecting to ElevenLabs Scribe Realtime API."
  );

  try {
    const eleven = getElevenLabsClient();

    const connection: RealtimeConnection =
      await eleven.speechToText.realtime.connect({
        modelId: "scribe_v2_realtime",
        commitStrategy:
          commitStrategy === "MANUAL"
            ? CommitStrategy.MANUAL
            : CommitStrategy.VAD,
        sampleRate: 48_000,
        audioFormat: AudioFormat.PCM_48000,

        // (function mapFormat(sr: number) {
        //   switch (sr) {
        //     case 8000:
        //       return AudioFormat.PCM_8000;
        //     case 16000:
        //       return AudioFormat.PCM_16000;
        //     case 22050:
        //       return AudioFormat.PCM_22050;
        //     case 24000:
        //       return AudioFormat.PCM_24000;
        //     case 44100:
        //       return AudioFormat.PCM_44100;
        //     case 48000:
        //       return AudioFormat.PCM_48000;
        //     default:
        //       return AudioFormat.PCM_16000;
        //   }
        // })(sampleRate),
      });

    let opened = false;
    const finalSegments: string[] = [];

    connection.on(RealtimeEvents.OPEN, (data) => {
      opened = true;
      logger.info({ data }, "[ElevenLabs] Realtime connection opened.");
    });

    connection.on(RealtimeEvents.ERROR, (message: any) => {
      logger.error(
        { message },
        "[ElevenLabs] Error received from realtime API."
      );
    });

    let retries = 0;
    while (!opened) {
      // Wait for the connection to open.
      await new Promise((r) => setTimeout(r, 100));
      retries++;
      if (retries >= 50) {
        logger.error(
          {},
          "[ElevenLabs] Realtime connection failed to open in time."
        );
        connection.close();
        return;
      }
    }

    connection.on(RealtimeEvents.SESSION_STARTED, (data) => {
      logger.info({ data }, "[ElevenLabs] Scribe session started.");
    });

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (message: any) => {
      const text: string = message?.text ?? "";
      logger.info({ message }, "[ElevenLabs] Transcript chunk.");
      if (text) {
        // Display partial transcript.
        logger.info({ partial: text }, "[ElevenLabs] Partial transcript.");
      }
    });

    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (message: any) => {
      const text: string = message?.text ?? "";
      logger.info({ message }, "[ElevenLabs] Commited transcript.");
      if (text) {
        finalTranscriptTotal += text.length;
        finalSegments.push(text);
        // Display final transcript for this segment.
        logger.info({ final: text }, "[ElevenLabs] Final transcript segment.");
      }
    });

    connection.on(
      RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS,
      (message: any) => {
        const text: string = message?.text ?? "";
        logger.info(
          { message },
          "[ElevenLabs] Commited transcript with timestamps."
        );
        if (text) {
          logger.info(
            { final: text },
            "[ElevenLabs] Final transcript with timestamps."
          );
        }
      }
    );

    // Stream raw PCM audio directly to ElevenLabs. The input file must already be PCM s16le mono at the specified sample rate.
    logger.info({ sampleRate }, "Starting direct PCM stream to ElevenLabs.");
    const rs = createReadStream(file);

    rs.on("error", (err) => {
      const e = normalizeError(err);
      logger.error({ err, e, file: filename }, "Failed to read audio file.");
      try {
        connection.close();
      } catch (_) {}
    });

    rs.on("data", (chunk: Buffer) => {
      try {
        const audioBase64 = chunk.toString("base64");
        connection.send({ audioBase64 });
        if (commitStrategy === "MANUAL") {
          connection.commit();
        }
        logger.info(
          "Sent audio chunk to ElevenLabs. Size: " +
            audioBase64.length +
            " bytes."
        );
      } catch (err) {
        const e = normalizeError(err);
        logger.error({ err: e }, "Failed to send audio chunk to ElevenLabs.");
      }
    });

    rs.on("end", () => {
      logger.info({ file: filename }, "All audio chunks sent.");
      if (commitStrategy === "MANUAL") {
        connection.commit();
      }
    });

    await new Promise<void>((resolve) => {
      connection.on(RealtimeEvents.CLOSE, (data) => {
        logger.info({ data }, "[ElevenLabs] Realtime connection closed.");
        resolve();
      });
    });

    // Wait a short grace period for final transcripts to arrive, then close if still open.
    await new Promise((r) => setTimeout(r, 1000));

    // Emit a combined full transcript if we received any final segments.
    const combined = finalSegments.join(" ").trim();
    if (combined.length > 0) {
      logger.info(
        { fullTranscript: combined, length: combined.length },
        "Full transcript."
      );
    } else {
      logger.warn({}, "No final transcript segments received.");
    }
    if (opened) {
      connection.close();
    }
  } catch (e) {
    logger.error(
      { err: e },
      "Failed to start ElevenLabs realtime transcription."
    );
  }
}

makeScript(
  {
    file: {
      type: "string",
      demandOption: true,
      description: "Path to the audio file to transcribe.",
    },
    sampleRate: {
      type: "number",
      default: 16000,
      description: "Sample rate for PCM output (Hz).",
    },
    commitStrategy: {
      type: "string",
      choices: ["VAD", "MANUAL"],
      default: "VAD",
      description: "Commit strategy for realtime transcription.",
    },
  },
  async ({ file, sampleRate, commitStrategy, execute }, logger) => {
    await run({ file, sampleRate, commitStrategy }, execute, logger);
  }
);
