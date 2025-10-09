import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { AugmentedMessage } from "@app/lib/utils/find_agents_in_message";
import type { LightWorkspaceType } from "@app/types";

// We are using webm with Opus codec
// In general browsers are using a 48 kbps bitrate
// A 1-minute recording will be around 400kB
// 60 seconds * 48000bps / 8 => 360 000 bit, round up to 400kB
const MAXIMUM_FILE_SIZE_FOR_INPUT_BAR_IN_BYTES = 400 * 1024;

interface UseVoiceTranscriberServiceParams {
  owner: LightWorkspaceType;
  onTranscribeDelta?: (delta: string) => void;
  onTranscribeComplete?: (transcript: AugmentedMessage[]) => void;
  fileUploaderService: FileUploaderService;
}

export function useVoiceTranscriberService({
  owner,
  onTranscribeDelta,
  onTranscribeComplete,
  fileUploaderService,
}: UseVoiceTranscriberServiceParams) {
  const [status, setStatus] = useState<
    "idle" | "authorizing_microphone" | "recording" | "transcribing"
  >("idle");
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendNotification = useSendNotification();

  const featureFlags = useFeatureFlags({ workspaceId: owner.sId });

  const stopLevelMetering = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      analyserRef.current = null;
      sourceNodeRef.current?.disconnect();
      sourceNodeRef.current = null;
      if (audioContextRef.current) {
        // Close the AudioContext to release resources.
        void audioContextRef.current.close();
      }
    } catch {
      // Ignore errors on cleanup.
    } finally {
      audioContextRef.current = null;
      setLevel(0);
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    return () => {
      stopLevelMetering();
    };
  }, [stopLevelMetering]);

  const startLevelMetering = useCallback(
    (stream: MediaStream) => {
      stopLevelMetering();
      try {
        const AC = hasWebkitAudioContext(window)
          ? window.webkitAudioContext
          : window.AudioContext;
        const ctx = new AC();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.85;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyserRef.current = analyser;
        sourceNodeRef.current = source;

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          const a = analyserRef.current;
          if (!a) {
            return;
          }

          a.getByteTimeDomainData(buffer);
          // Compute RMS level from time-domain data. Normalize to [0, 1].
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128; // [-1, 1]
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / buffer.length); // ~0..1
          // Map RMS to a smoother visual level with light bias to show activity.
          const visual = Math.max(0, Math.min(1, (rms - 0.02) / 0.3));

          setLevel(visual);
        };
        intervalRef.current = setInterval(tick, 250);
      } catch {
        // If metering fails (unsupported), we silently ignore.
        audioContextRef.current = null;
        analyserRef.current = null;
      }
    },
    [stopLevelMetering]
  );

  // Cleanup on unmounting: ensure the recorder is stopped and tracks are closed.
  useEffect(() => {
    return () => {
      stopRecorder(mediaRecorderRef.current);
      stopLevelMetering();
      stopTracks(streamRef.current);
    };
  }, [stopLevelMetering]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (status === "recording") {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      // Reset timer when not recording.
      setElapsedSeconds(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status]);

  const startRecording = useCallback(async () => {
    if (status === "recording" || status === "authorizing_microphone") {
      return;
    }
    try {
      setStatus("authorizing_microphone");
      const stream = await requestMicrophone();
      streamRef.current = stream;

      const recorder = createRecorder(stream, chunksRef);
      mediaRecorderRef.current = recorder;

      // Start level metering alongside recording.
      startLevelMetering(stream);

      recorder.start();

      setStatus("recording");
    } catch {
      sendNotification({
        type: "error",
        title: "Microphone permission required.",
        description: "Please allow microphone access and try again.",
      });
    }
  }, [sendNotification, startLevelMetering, status]);

  const finalizeRecordingTranscribeToInputBar = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);

      const resp = await fetch(`/api/w/${owner.sId}/services/transcribe`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const msg = await resp.text();
        sendNotification({
          type: "error",
          title: "Voice upload failed.",
          description: msg || "Failed to send audio for transcription.",
        });
        return;
      }

      // Stream Server-Sent Events and forward deltas.
      const body = resp.body;
      if (!body) {
        sendNotification({
          type: "error",
          title: "Transcription failed.",
          description: "Empty response while streaming transcription.",
        });
        return;
      }

      await readSSEFromPostRequest({
        body,
        onTranscribeDelta,
        onTranscribeComplete,
      });
    },
    [onTranscribeDelta, onTranscribeComplete, owner.sId, sendNotification]
  );

  const finalizeRecordingAddAsAttachment = useCallback(
    async (file: File) => {
      await fileUploaderService.handleFilesUpload([file]);
      sendNotification({
        type: "success",
        title: "Attachment added.",
        description: "Your voice message was added to attachments.",
      });
    },
    [fileUploaderService, sendNotification]
  );

  const stopAndFinalize = useCallback(async () => {
    setStatus("transcribing");

    try {
      const file = buildAudioFile(chunksRef.current);
      chunksRef.current = [];

      if (file.size <= MAXIMUM_FILE_SIZE_FOR_INPUT_BAR_IN_BYTES) {
        await finalizeRecordingTranscribeToInputBar(file);
      } else {
        await finalizeRecordingAddAsAttachment(file);
      }
    } catch (e) {
      sendNotification({
        type: "error",
        title: "Recording error.",
        description:
          e instanceof Error ? e.message : "An unknown error occurred.",
      });
    } finally {
      stopLevelMetering();
      stopTracks(streamRef.current);
      streamRef.current = null;
    }
  }, [
    finalizeRecordingTranscribeToInputBar,
    finalizeRecordingAddAsAttachment,
    sendNotification,
    stopLevelMetering,
  ]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.stop();
    await stopped;
    await stopAndFinalize();
  }, [stopAndFinalize]);

  return featureFlags.hasFeature("simple_audio_transcription")
    ? {
        status,
        level,
        elapsedSeconds,
        startRecording,
        stopRecording,
      }
    : quackingVoiceTranscriptService;
}

export type VoiceTranscriberService = ReturnType<
  typeof useVoiceTranscriberService
>;

// Helpers ---------------------------------------------------------------------

const quackingVoiceTranscriptService = {
  status: "idle",
  level: 0,
  elapsedSeconds: 0,
  startRecording: () => Promise.resolve(),
  stopRecording: () => Promise.resolve(),
};

const stopTracks = (stream: MediaStream | null) => {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((t) => t.stop());
};

const stopRecorder = (recorder: MediaRecorder | null) => {
  if (!recorder) {
    return;
  }
  if (recorder.state !== "inactive") {
    recorder.stop();
  }
};

const buildAudioFile = (chunks: Blob[]) => {
  const blob = new Blob(chunks, { type: "audio/webm" });
  const filename = `voice-${new Date().toISOString()}.webm`;

  return new File([blob], filename, { type: "audio/webm" });
};

const requestMicrophone = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({ audio: true });
};

const createRecorder = (
  stream: MediaStream,
  chunksRef: MutableRefObject<Blob[]>
): MediaRecorder => {
  const recorder = new MediaRecorder(stream, {
    mimeType: "audio/webm;codecs=opus",
  });
  chunksRef.current = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunksRef.current.push(e.data);
    }
  };
  return recorder;
};

// Type guard to check for prefixed webkitAudioContext without unsafe casts.
function hasWebkitAudioContext(
  w: Window & typeof globalThis
  // @ts-expect-error - Type 'Window' is not assignable to type 'Window & typeof globalThis'.
): w is Window & { webkitAudioContext: typeof AudioContext } {
  return "webkitAudioContext" in w;
}

// There is no built-in SSE support in the Fetch API for POST, so we manually parse the stream.
const readSSEFromPostRequest = async ({
  body,
  onTranscribeDelta,
  onTranscribeComplete,
}: {
  body: ReadableStream<Uint8Array>;
  onTranscribeDelta?: (delta: string) => void;
  onTranscribeComplete?: (transcript: AugmentedMessage[]) => void;
}) => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneStreaming = false;

  try {
    // Read until the server signals completion with a \n\n separator after a done event
    // or the stream ends.
    while (!doneStreaming) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by double newlines. Support both \n\n and \r\n\r\n.
      // Process as many complete events as available.
      while (!doneStreaming) {
        const nn = buffer.indexOf("\n\n");
        const rr = buffer.indexOf("\r\n\r\n");
        if (nn === -1 && rr === -1) {
          break;
        }
        const useNn = nn !== -1 && (rr === -1 || nn < rr);
        const sep = useNn ? nn : rr;
        const delimLen = useNn ? 2 : 4;
        const eventChunk = buffer.slice(0, sep);
        buffer = buffer.slice(sep + delimLen);

        // Extract the data line(s). Our server sends single-line data payloads.
        const lines = eventChunk.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          if (!trimmed.startsWith("data:")) {
            continue;
          }
          const payload = trimmed.slice(5).trim();
          if (payload === "done") {
            doneStreaming = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload) as
              | { type: "delta"; delta: string }
              | { type: "fullTranscript"; fullTranscript: AugmentedMessage[] };

            if (parsed.type === "delta") {
              onTranscribeDelta && onTranscribeDelta(parsed.delta);
            } else if (parsed.type === "fullTranscript") {
              onTranscribeComplete &&
                onTranscribeComplete(parsed.fullTranscript);

              doneStreaming = true;
            }
          } catch {
            // Ignore malformed payloads and continue.
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
};
