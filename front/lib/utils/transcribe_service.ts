import type formidable from "formidable";
import fs from "fs";
import OpenAI from "openai";
import type {
  InputAudioBufferAppendEvent,
  TranscriptionSessionUpdate,
} from "openai/resources/beta/realtime/realtime.mjs";
import type { FileLike } from "openai/uploads";
import { toFile } from "openai/uploads";
import type { Readable } from "stream";
import WebSocket from "ws";

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

export async function streamTranscribeStream(
  input: Readable
): Promise<AsyncIterable<TranscriptionStreamEvent>> {
  // Use OpenAI Realtime API over WebSocket to stream audio bytes and receive transcript events.
  // Assumptions: `input` provides raw 16-bit PCM audio at 24kHz mono, or otherwise a supported
  // format accepted by the Realtime API when appended as input_audio_buffer. We do not perform
  // resampling here.
  const { OPENAI_API_KEY } = dustManagedCredentials();

  // Choose a realtime-capable model. We keep transcribe model separate from realtime.
  const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

  const url = `wss://api.openai.com/v1/realtime?intent=transcription`;

  // Create a simple async queue to bridge WS events to an async iterator.
  type QueueItem =
    | TranscriptionStreamEvent
    | { type: "error"; error: Error }
    | { type: "end" };
  const queue: QueueItem[] = [];
  let resolveNext:
    | ((v: IteratorResult<TranscriptionStreamEvent>) => void)
    | null = null;
  let finished = false;
  let accumulated = "";

  function pushEvent(ev: TranscriptionStreamEvent) {
    logger.info("pushEvent " + ev);
    if (finished) {
      return;
    }
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: ev, done: false });
    } else {
      queue.push(ev);
    }
  }
  function pushError(error: Error) {
    logger.error({ err: error }, "Realtime transcription error");
    if (finished) {
      return;
    }
    finished = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      // Surface the error by throwing when consumer awaits next.
      // We do this by marking done and then scheduling a microtask to throw when iterating.
      r({ value: { fullTranscript: "", type: "fullTranscript" }, done: true });
    }
  }
  function pushEnd(finalText?: string) {
    logger.info("pushEnd");
    if (finished) {
      return;
    }
    finished = true;
    if (finalText && finalText.length > 0) {
      pushEvent({ type: "fullTranscript", fullTranscript: finalText });
    } else if (accumulated.length > 0) {
      pushEvent({ type: "fullTranscript", fullTranscript: accumulated });
    }
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined as any, done: true });
    }
  }

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
            model: "whisper-1",
          },
          turn_detection: {
            type: "server_vad",
          },
        },
      } as TranscriptionSessionUpdate)
    );
    // ws.send(
    //   JSON.stringify({
    //     type: "response.create",
    //     response: {
    //       modalities: ["text"],
    //       instructions: "Transcribe the provided audio precisely.",
    //     },
    //   } as ResponseCreateEvent)
    // );
    try {
      // Stream audio chunks as base64 via input_audio_buffer.append
      logger.info("Opening realtime websocket");
      for await (const chunk of input) {
        // input.on("data", (chunk: string) => {
        logger.info("Streaming audio chunk " + chunk.length);
        // const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
        // const base64 = buf.toString("ascii");
        const message = {
          type: "input_audio_buffer.append",
          audio: chunk,
        } as InputAudioBufferAppendEvent;
        ws.send(JSON.stringify(message));

        // ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        // ws.send(
        //   JSON.stringify({
        //     type: "response.create",
        //     response: {
        //       modalities: ["text"],
        //       instructions: "Transcribe the provided audio precisely.",
        //     },
        //   })
        // );
      }
      // Commit buffer and request a response\
      logger.info("Committing realtime websocket");
      // ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    } catch (err) {
      pushError(normalizeError(err));
      try {
        ws.close();
      } catch (closeErr) {
        logger.warn(
          { err: normalizeError(closeErr) },
          "Failed to close realtime websocket after error."
        );
      }
    }
  });

  ws.on("message", (data: WebSocket.RawData) => {
    try {
      const text = typeof data === "string" ? data : data.toString("utf8");
      const msg = JSON.parse(text);
      const t = msg.type as string | undefined;

      logger.info("Realtime websocket message type " + t);
      logger.info("Realtime websocket message " + text);

      switch (t) {
        case "input_audio_transcription.delta": {
          const d = msg.delta as string | undefined;
          if (d && d.length > 0) {
            accumulated += d;
            pushEvent({ type: "delta", delta: d });
          }
          break;
        }
        case "input_audio_transcription.completed": {
          const full = msg.text as string | undefined;
          pushEnd(full);
          ws.close();
          break;
        }
        // Some models emit generic response.* events.
        case "response.delta": {
          const d = msg.delta as string | undefined;
          if (typeof d === "string" && d.length > 0) {
            accumulated += d;
            pushEvent({ type: "delta", delta: d });
          }
          break;
        }
        case "response.completed": {
          // Attempt to extract final text if provided; otherwise rely on accumulated.
          const full =
            (msg.response && msg.response.output_text) || accumulated;
          pushEnd(typeof full === "string" ? full : accumulated);
          ws.close();
          break;
        }
        case "error": {
          const e = new Error(msg.error?.message || "Realtime API error");
          pushError(e);
          // ws.close();
          break;
        }
        default:
          // Ignore other event types.
          break;
      }
    } catch (err) {
      pushError(normalizeError(err));
      try {
        ws.close();
      } catch (closeErr) {
        logger.warn(
          { err: normalizeError(closeErr) },
          "Failed to close realtime websocket after error."
        );
      }
    }
  });

  ws.on("error", (err) => {
    pushError(normalizeError(err));
  });

  ws.on("close", () => {
    pushEnd();
  });

  // Return an async iterator over our queue.
  return (async function* (): AsyncGenerator<TranscriptionStreamEvent> {
    try {
      while (true) {
        if (queue.length > 0) {
          const item = queue.shift() as QueueItem;
          if ((item as any)?.type === "end") {
            return;
          }
          if ((item as any)?.type === "error") {
            throw (item as any).error;
          }
          yield item as TranscriptionStreamEvent;
          continue;
        }
        if (finished) {
          return;
        }
        const next: Promise<IteratorResult<TranscriptionStreamEvent>> =
          new Promise((resolve) => {
            resolveNext = resolve;
          });
        const r = await next;
        if (r.done) {
          return;
        }
        yield r.value as TranscriptionStreamEvent;
      }
    } finally {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      } catch (closeErr) {
        logger.warn(
          { err: normalizeError(closeErr) },
          "Failed to close realtime websocket in finally."
        );
      }
    }
  })();
}
