import fs from "fs";
import type {
  InputAudioBufferAppendEvent,
  TranscriptionSessionUpdate,
} from "openai/resources/beta/realtime/realtime.mjs";
import WebSocket from "ws";

import {makeScript} from "@app/scripts/helpers";
import {dustManagedCredentials} from "@app/types";

makeScript({}, async ({}, logger) => {
  return new Promise((resolve, reject) => {
    logger.info("Starting transcription");
    const { OPENAI_API_KEY } = dustManagedCredentials();

    const readPath = "/Users/rcs/Downloads/rso28nio9503bwhuc29bhz4r8.wav";
    const readStream = fs.createReadStream(readPath);

    const url = `wss://api.openai.com/v1/realtime?intent=transcription`;

    logger.info("Connecting to realtime websocket");
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", async () => {
      // Once WS is open, start pumping audio bytes.
      logger.info("Realtime websocket opened");
      ws.send(
        JSON.stringify({
          type: "transcription_session.update",
          session: {
            input_audio_format: "pcm16",
            input_audio_transcription: {
              model: "gpt-4o-transcribe",
            },
            turn_detection: {
              type: "server_vad",
            },
          },
        } as TranscriptionSessionUpdate)
      );

      try {
        // Stream audio chunks as base64 via input_audio_buffer.append
        logger.info("Opening realtime websocket");
        for await (const chunk of readStream) {
          logger.info("Streaming audio chunk " + chunk.length);
          const message = {
            type: "input_audio_buffer.append",
            audio: chunk.toString("base64"),
          } as InputAudioBufferAppendEvent;
          ws.send(JSON.stringify(message));
        }
        logger.info("Committing realtime websocket");
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      } catch (err) {
        logger.error({ err }, "Error streaming audio to websocket");
        try {
          ws.close();
        } catch (closeErr) {
          logger.warn(
            { closeErr },
            "Failed to close realtime websocket after error."
          );
        }
      }
    });

    ws.on("message", (data: WebSocket.RawData) => {
      try {
        const text = data.toString("utf8");
        const msg = JSON.parse(text);
        const t = msg.type as string | undefined;

        logger.info("Realtime websocket message type " + t);
        logger.info("Realtime websocket message " + text);
      } catch (err) {
        logger.error({ err }, "Error handling message from websocket");
        try {
          ws.close();
        } catch (closeErr) {
          logger.warn(
            { closeErr },
            "Failed to close realtime websocket after error."
          );
        }
      }
    });

    ws.on("error", (err) => {
      logger.error({ err }, "Realtime websocket error");
      reject();
    });

    ws.on("close", () => {
      logger.info("Realtime websocket closed");
      resolve();
    });
  });
});
