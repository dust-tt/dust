import { Button, cn, MicIcon, SquareIcon } from "@dust-tt/sparkle";
import type { MutableRefObject } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { WavPacker } from "@app/components/assistant/voice/wav_packer";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import type { WorkspaceType } from "@app/types";

import { WavRecorder } from "./voice/wav_recorder.js";

// Component intent:
// - Supports two recording interaction patterns:
//   - "hold": Press and hold to record, release to stop and transcribe immediately.
//   - "click": Click to start recording, click again to stop and add as an attachment.
// - Shows a loading state while transcribing and sends notifications on success/failure.

interface VoicePickerProps {
  owner: WorkspaceType;
  fileUploaderService: FileUploaderService;
  onTranscribeDelta: (delta: string) => void;
  disabled?: boolean;
}

export function VoicePicker({
  owner,
  fileUploaderService,
  onTranscribeDelta,
  disabled = false,
}: VoicePickerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mode, setMode] = useState<"hold" | "click">("hold");

  // WavRecorder instance used for "hold" mode.
  const wavRecorderRef = useRef<WavRecorder | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live transcription SSE and ordered live upload queue.
  const sseRef = useRef<EventSource | null>(null);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueLivePost = useCallback(
    (body: { type: "start" | "audio" | "end"; data?: string }) => {
      // Chain requests to preserve order.
      sendQueueRef.current = sendQueueRef.current
        .then(async () => {
          console.log("sendQueue");
          await fetch(`/api/w/${owner.sId}/me/audio/live`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return undefined;
        })
        .catch(() => {
          // Ignore network errors here; SSE will surface failures if critical.
        });
    },
    [owner.sId]
  );

  // Track pointer press to distinguish click (<150ms) vs hold (>=150ms).
  const pressStartRef = useRef<number | null>(null);
  const pressTimeoutRef = useRef<number | null>(null);

  const sendNotification = useSendNotification();

  const stopLevelMetering = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
    }
  }, []);

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
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
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
      // Clear any pending press timeout.
      clearPressTimeout();
      pressStartRef.current = null;
      // Ensure any ongoing WavRecorder session is stopped.
      try {
        const wr = wavRecorderRef.current;
        void wr?.quit();
      } catch {}
      wavRecorderRef.current = null;
      stopRecorder(mediaRecorderRef.current);
      stopLevelMetering();
      stopTracks(streamRef.current);
      // Close live transcription SSE if open.
      try {
        sseRef.current?.close();
      } catch {}
      sseRef.current = null;
    };
  }, [stopLevelMetering]);

  const openTranscriptionSSE = useCallback(() => {
    try {
      // Close any previous SSE if still open.
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {}
      }
      const es = new EventSource(`/api/w/${owner.sId}/me/audio/transcription`);
      sseRef.current = es;
      setIsTranscribing(true);

      es.onmessage = (ev) => {
        console.debug("SSE message", ev.data);
        const data = ev.data;
        if (data === "done") {
          es.close();
          sseRef.current = null;
          setIsTranscribing(false);
          sendNotification({
            type: "success",
            title: "Voice recorded.",
            description: "Audio sent for transcription.",
          });
          return;
        }
        try {
          const parsed = JSON.parse(data) as
            | { type: "delta"; delta: string }
            | { type: "full_transcript"; text: string }
            | { type: "error"; message: string };

          if (parsed.type === "delta") {
            onTranscribeDelta(parsed.delta);
          } else if (parsed.type === "full_transcript") {
            es.close();
            sseRef.current = null;
            setIsTranscribing(false);
          } else if (parsed.type === "error") {
            es.close();
            sseRef.current = null;
            setIsTranscribing(false);
            sendNotification({
              type: "error",
              title: "Transcription failed.",
              description: parsed.message,
            });
          }
        } catch {
          // Ignore non-JSON messages (if any) except for "done" handled above.
        }
      };

      es.onerror = () => {
        try {
          es.close();
        } catch {}
        sseRef.current = null;
        setIsTranscribing(false);
        sendNotification({
          type: "error",
          title: "Transcription connection error.",
          description: "Could not connect to live transcription.",
        });
      };
    } catch {
      setIsTranscribing(false);
      sendNotification({
        type: "error",
        title: "Transcription connection error.",
        description: "Could not connect to live transcription.",
      });
    }
  }, [onTranscribeDelta, owner.sId, sendNotification]);

  const finalizeRecordingClick = useCallback(
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

  const clearPressTimeout = () => {
    if (pressTimeoutRef.current !== null) {
      window.clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRecording) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      // Reset timer when not recording
      setElapsedSeconds(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isRecording]);

  // ----- Recording flow -------------------------------------------------------

  const startRecording = useCallback(
    async (reason: "hold" | "click") => {
      if (isRecording) {
        return;
      }
      try {
        if (reason === "hold") {
          // Use WavRecorder for hold-to-record mode.
          let wr = wavRecorderRef.current;
          if (!wr) {
            wr = new WavRecorder({ sampleRate: 44100 });
            wavRecorderRef.current = wr;
          }
          await wr.begin();
          if (wr.stream) {
            streamRef.current = wr.stream;
            startLevelMetering(streamRef.current);
          }
          // Open SSE to receive live transcription and start the live stream.
          openTranscriptionSSE();
          enqueueLivePost({ type: "start" });
          let first = true;
          // Start recording and send chunks to the live endpoint as they arrive.
          await wr.record(async ({ raw }) => {
            try {
              if (raw && raw.byteLength > 0) {
                if (first) {
                  const float32Array = new Float32Array(0xffffffff);

                  const audio = {
                    bitsPerSample: 16,
                    channels: [float32Array],
                    data: raw,
                  };
                  const packer = new WavPacker();
                  const result = packer.pack(wr?.getSampleRate(), audio);
                  const b64 = await blobToBase64v2(result.blob);
                  enqueueLivePost({ type: "audio", data: b64 });
                  first = false;
                } else {
                  const b64 = arrayBufferToBase64(raw);
                  enqueueLivePost({ type: "audio", data: b64 });
                }
              }
            } catch {
              // Ignore chunk processing errors.
            }
          }, 32_000);
          setIsRecording(true);
          setIsTranscribing(true);
        } else {
          // Click mode: use MediaRecorder to capture webm for attachments.
          const stream = await requestMicrophone();
          streamRef.current = stream;

          const recorder = createRecorder(stream, chunksRef);
          mediaRecorderRef.current = recorder;

          // Start level metering alongside recording.
          startLevelMetering(stream);

          recorder.start();
          setIsRecording(true);
        }
      } catch {
        sendNotification({
          type: "error",
          title: "Microphone permission required.",
          description: "Please allow microphone access and try again.",
        });
      }
    },
    [
      isRecording,
      sendNotification,
      startLevelMetering,
      openTranscriptionSSE,
      enqueueLivePost,
    ]
  );

  const stopAndFinalize = useCallback(
    async (reason: "hold" | "click") => {
      setIsRecording(false);
      setIsTranscribing(true);

      try {
        if (reason === "click") {
          const file = buildAudioFile(chunksRef.current);
          chunksRef.current = [];

          await finalizeRecordingClick(file);
        } else {
          if (wavRecorderRef.current) {
            await wavRecorderRef.current.end();
            const { blob } = await wavRecorderRef.current.save();
            console.log("blob", blob.size);
            const file = new File([blob], `voice-${Date.now()}.wav`, {
              type: "audio/wav",
            });
            const form = new FormData();
            form.append("file", file);
            await fetch(
              `/api/w/${owner.sId}/services/transcribe?stream=false`,
              {
                method: "POST",
                body: form,
              }
            );
          }
        }
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Recording error.",
          description:
            e instanceof Error ? e.message : "An unknown error occurred.",
        });
      } finally {
        setIsTranscribing(false);
        stopLevelMetering();
        stopTracks(streamRef.current);
        streamRef.current = null;
      }
    },
    [finalizeRecordingClick, sendNotification, stopLevelMetering]
  );

  const stopRecording = useCallback(
    async (reason: "hold" | "click") => {
      if (reason === "hold") {
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const wr = wavRecorderRef.current;
          if (!wr) {
            throw new Error("Recorder not initialized");
          }
          // Flush any buffered audio chunks, then signal end of stream.
          await wr.pause();
          enqueueLivePost({ type: "end" });

          await sendQueueRef.current;

          const { blob } = await wr.save();
          console.log("blob", blob.size);
          const file = new File([blob], `voice-${Date.now()}.wav`, {
            type: "audio/wav",
          });
          const form = new FormData();
          form.append("file", file);
          await fetch(`/api/w/${owner.sId}/services/transcribe?stream=false`, {
            method: "POST",
            body: form,
          });
          await wr.end();
        } catch (e) {
          sendNotification({
            type: "error",
            title: "Recording error.",
            description:
              e instanceof Error ? e.message : "An unknown error occurred.",
          });
        } finally {
          // Do not clear isTranscribing here; the SSE completion will handle it.
          stopLevelMetering();
          stopTracks(streamRef.current);
          streamRef.current = null;
          wavRecorderRef.current = null;
        }

        return;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        return;
      }

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.stop();
      await stopped;
      await stopAndFinalize(reason);
    },
    [sendNotification, stopLevelMetering, stopAndFinalize, enqueueLivePost]
  );

  // ----- Event handlers -------------------------------------------------------

  // Type guard to check for prefixed webkitAudioContext without unsafe casts.

  function hasWebkitAudioContext(
    w: Window & typeof globalThis
    // @ts-expect-error - Type 'Window' is not assignable to type 'Window & typeof globalThis'.
  ): w is Window & { webkitAudioContext: typeof AudioContext } {
    return "webkitAudioContext" in w;
  }

  // ----- Level metering (audio input visualization) ----------------------------

  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // ----- Event handlers -------------------------------------------------------

  const handlePointerDown = async () => {
    if (disabled) {
      return;
    }
    // Mark the start time of the press.
    pressStartRef.current = Date.now();

    // Schedule transition to hold mode if press lasts >= 150ms.
    clearPressTimeout();
    pressTimeoutRef.current = window.setTimeout(async () => {
      // If still pressed, enter hold mode and start recording.
      if (pressStartRef.current !== null) {
        setMode("hold");
        if (!isRecording) {
          await startRecording("hold");
        }
      }
    }, 150);
  };

  const handlePointerUp = async () => {
    if (disabled) {
      return;
    }

    const start = pressStartRef.current;
    // Clear press state and timeout.
    clearPressTimeout();
    pressStartRef.current = null;

    const now = Date.now();
    const duration = typeof start === "number" ? now - start : Infinity;

    if (duration < 150) {
      // Click mode: toggle start/stop on click.
      setMode("click");
      if (!isRecording) {
        await startRecording("click");
        return;
      }
      await stopRecording("click");
      return;
    }

    // Hold mode: release stops the recording if active.
    if (isRecording) {
      await stopRecording("hold");
    }
  };

  const handlePointerLeave = async () => {
    if (disabled || mode !== "hold") {
      return;
    }
    if (isRecording) {
      await stopRecording("hold");
    }
  };

  const handlePointerClick = async () => {
    if (disabled || mode !== "click") {
      return;
    }
    if (isRecording) {
      await stopRecording("click");
    }
  };

  return (
    <>
      <div
        className={cn(
          "duration-600 flex items-center justify-end gap-2 overflow-hidden px-2 transition-all ease-in-out",
          isRecording ? "w-32 opacity-100" : "w-8 opacity-0"
        )}
      >
        <div className="heading-xs font-mono">{formatTime(elapsedSeconds)}</div>
        <VoiceLevelDisplay level={level} />
      </div>
      <Button
        size="xs"
        icon={isRecording ? SquareIcon : MicIcon}
        isLoading={isTranscribing}
        variant={isRecording ? "highlight" : "ghost-secondary"}
        tooltip={computeTooltip(mode, isRecording, isTranscribing)}
        label={isRecording ? "Stop" : undefined}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handlePointerClick}
      />
    </>
  );
}

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
  // onstop is handled by whoever calls `stop()`.
  return recorder;
};

const computeTooltip = (
  mode: string,
  isRecording: boolean,
  isTranscribing: boolean
): string => {
  if (isTranscribing) {
    return "Transcribing...";
  }
  if (mode === "hold" && isRecording) {
    return "Release to stop";
  }
  return isRecording ? "Stop recording" : "Click, or Press & Hold to record";
};

interface VoiceLevelIconProps {
  level: number; // Expected in [0, 1].
}

const VoiceLevelDisplay = ({ level }: VoiceLevelIconProps) => {
  // Clamp and ease the level a bit for smoother visuals.
  const l = Math.max(0, Math.min(1, level * 1.2));
  const eased = Math.pow(l, 0.8);

  // Base shape (percent heights) taken from the template.
  const base = [22, 33, 18, 64, 98, 56, 6, 34, 76, 46, 12, 22];

  // Minimal visible heights to keep subtle motion when quiet.
  const minHeights = base.map((b) => Math.max(6, Math.round(b * 0.3)));

  // Interpolate between minimal and base depending on current level.
  const heights = base.map((b, i) =>
    Math.max(
      1,
      Math.min(100, Math.round(minHeights[i] + (b - minHeights[i]) * eased))
    )
  );

  return (
    <div className="flex h-5 items-center gap-0.5">
      {heights.map((h, i) => (
        <div
          // Only the height varies according to the level; rest matches the template.
          key={i}
          className="min-h-1 w-0.5 rounded-full bg-muted-foreground"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Usage with Blob:
async function blobToBase64v2(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then(arrayBufferToBase64);
}
