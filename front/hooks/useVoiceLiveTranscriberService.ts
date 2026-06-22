import { useSendNotification } from "@app/hooks/useNotification";
import { requestMicrophone } from "@app/hooks/useVoiceTranscriberService";
import {
  hasWebkitAudioContext,
  quackingVoiceTranscriptService,
  SAMPLE_RATE_HZ,
  startLevelMeteringInterval,
  useElapsedSeconds,
  type VoiceTranscriberService,
  type VoiceTranscriberStatus,
} from "@app/hooks/utils/voice";
import type { GetTranscribeTokenResponseBody } from "@app/lib/api/transcribe";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { AudioFormat, CommitStrategy, useScribe } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceLiveTranscriberServiceParams {
  owner: LightWorkspaceType;
  // Called on each partial transcript — insert or update the pending animated node.
  onPartialTranscript?: (text: string) => void;
  // Called when the engine commits a segment — replace the animated node with plain text.
  onTranscribeDelta?: (text: string) => void;
  onTranscribeComplete?: () => void;
  onError?: (error: Error) => void;
}

export type VoiceLiveTranscriberService = VoiceTranscriberService;

// AudioWorklet processor: converts float32 PCM to int16 and transfers the buffer
// to the main thread. Runs on the dedicated audio-rendering thread (not main thread).
const PCM_WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const float32 = input[0];
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

function createPCMWorkletURL(): string {
  const blob = new Blob([PCM_WORKLET_CODE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

export function useVoiceLiveTranscriberService({
  owner,
  onPartialTranscript,
  onTranscribeDelta,
  onTranscribeComplete,
  onError,
}: UseVoiceLiveTranscriberServiceParams): VoiceLiveTranscriberService {
  const [status, setStatus] = useState<VoiceTranscriberStatus>("idle");
  const [level, setLevel] = useState(0);
  const elapsedSeconds = useElapsedSeconds(status);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep latest callbacks in refs so the stable SDK closures always see fresh values.
  const onPartialTranscriptRef = useRef(onPartialTranscript);
  onPartialTranscriptRef.current = onPartialTranscript;
  const onTranscribeDeltaRef = useRef(onTranscribeDelta);
  onTranscribeDeltaRef.current = onTranscribeDelta;
  const onTranscribeCompleteRef = useRef(onTranscribeComplete);
  onTranscribeCompleteRef.current = onTranscribeComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const sendNotification = useSendNotification();

  // Tracks whether we are in the process of shutting down after a user-initiated stop.
  // When true, the next committed_transcript triggers disconnect + onTranscribeComplete.
  const isShuttingDownRef = useRef(false);
  const shutdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (levelIntervalRef.current !== null) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    try {
      processorRef.current?.disconnect();
      analyserRef.current?.disconnect();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    } catch {
      // ignore cleanup errors
    }
    processorRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    setLevel(0);
  }, []);

  // Finalizes shutdown after the committed_transcript from a user stop is received,
  // or on the safety timeout if the server never responds.
  const finishShutdown = useCallback(() => {
    if (!isShuttingDownRef.current) {
      return;
    }
    if (shutdownTimeoutRef.current !== null) {
      clearTimeout(shutdownTimeoutRef.current);
      shutdownTimeoutRef.current = null;
    }
    isShuttingDownRef.current = false;
    scribeRef.current.disconnect();
    setStatus("idle");
    onTranscribeCompleteRef.current?.();
  }, []);

  const handlePartialTranscript = useCallback(({ text }: { text: string }) => {
    onPartialTranscriptRef.current?.(text);
  }, []);

  const handleCommittedTranscript = useCallback(
    ({ text }: { text: string }) => {
      onTranscribeDeltaRef.current?.(text);
      // If we committed as part of a user-initiated stop, disconnect now that
      // the server has delivered the final transcript.
      finishShutdown();
    },
    [finishShutdown]
  );

  const handleError = useCallback(
    (err: Error | Event) => {
      const error =
        err instanceof Error ? err : new Error("Transcription error.");
      onErrorRef.current?.(error);
      if (shutdownTimeoutRef.current !== null) {
        clearTimeout(shutdownTimeoutRef.current);
        shutdownTimeoutRef.current = null;
      }
      isShuttingDownRef.current = false;
      cleanup();
      setStatus("idle");
    },
    [cleanup]
  );

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    audioFormat: AudioFormat.PCM_16000,
    sampleRate: SAMPLE_RATE_HZ,
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: handlePartialTranscript,
    onCommittedTranscript: handleCommittedTranscript,
    onError: handleError,
  });

  // Keep a stable ref so onaudioprocess always reaches the latest scribe instance.
  const scribeRef = useRef(scribe);
  scribeRef.current = scribe;

  useEffect(() => {
    return () => {
      scribeRef.current.disconnect();
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    if (status === "recording" || status === "authorizing_microphone") {
      return;
    }

    try {
      setStatus("authorizing_microphone");

      // Fetch a single-use ElevenLabs token from our backend.
      const resp = await clientFetch(
        `/api/w/${owner.sId}/services/transcribe/get-token`
      );
      if (!resp.ok) {
        throw new Error("Failed to obtain transcription token.");
      }
      const { token, baseUri } =
        (await resp.json()) as GetTranscribeTokenResponseBody;

      // Request microphone access.
      const stream = await requestMicrophone();
      streamRef.current = stream;

      // Connect to ElevenLabs Scribe (manual audio mode — we handle PCM capture).
      await scribeRef.current.connect({ token, baseUri });

      // Create AudioContext at 16 kHz — matches ElevenLabs pcm_16000 format.
      const AC = hasWebkitAudioContext(window)
        ? window.webkitAudioContext
        : window.AudioContext;
      const audioContext = new AC({ sampleRate: SAMPLE_RATE_HZ });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Level metering via AnalyserNode.
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      analyserRef.current = analyser;
      levelIntervalRef.current = startLevelMeteringInterval(
        analyser,
        analyserRef,
        setLevel
      );

      // AudioWorkletNode captures raw PCM on the audio thread and posts int16 buffers
      // to the main thread, which forwards them to Scribe.
      const workletUrl = createPCMWorkletURL();
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const b64 = arrayBufferToBase64(event.data);
        if (!isShuttingDownRef.current || scribeRef.current.isConnected) {
          scribeRef.current.sendAudio(b64, { sampleRate: SAMPLE_RATE_HZ });
        }
      };
      source.connect(workletNode);
      processorRef.current = workletNode;

      setStatus("recording");
    } catch (err) {
      const error = normalizeError(err);
      const isPermissionError =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError");

      sendNotification({
        type: "error",
        title: isPermissionError
          ? "Microphone permission required."
          : "Could not start recording.",
        description: isPermissionError
          ? "Please allow microphone access and try again."
          : error.message,
      });
      scribeRef.current.disconnect();
      cleanup();
      setStatus("idle");
    }
  }, [owner.sId, status, sendNotification, cleanup]);

  const stopRecording = useCallback(async () => {
    if (status !== "recording") {
      return;
    }

    // 1. Stop audio capture so no more audio is sent to the WebSocket.
    cleanup();

    // 2. Force-commit buffered audio so the server flushes any pending transcript.
    //    Guard against a second invocation while a shutdown is already in progress
    //    (isShuttingDownRef is a ref so it updates synchronously, unlike React state).
    if (!isShuttingDownRef.current) {
      scribeRef.current.commit();
    }

    // 3. Mark shutdown pending — handleCommittedTranscript will disconnect once the
    //    server delivers the committed_transcript response to the commit above.
    isShuttingDownRef.current = true;

    // 4. Safety timeout: force-close if the server never delivers a committed_transcript.
    shutdownTimeoutRef.current = setTimeout(finishShutdown, 2000);
  }, [status, cleanup, finishShutdown]);

  return owner.metadata?.allowVoiceTranscription !== false
    ? { status, level, elapsedSeconds, startRecording, stopRecording }
    : quackingVoiceTranscriptService;
}
