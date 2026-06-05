import { useSendNotification } from "@app/hooks/useNotification";
import { requestMicrophone } from "@app/hooks/useVoiceTranscriberService";
import {
  hasWebkitAudioContext,
  quackingVoiceTranscriptService,
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
  onTranscribeDelta?: (text: string) => void;
  onTranscribeComplete?: () => void;
  onError?: (error: Error) => void;
}

export type VoiceLiveTranscriberService = VoiceTranscriberService;

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

export function useVoiceLiveTranscriberService({
  owner,
  onTranscribeDelta,
  onTranscribeComplete,
  onError,
}: UseVoiceLiveTranscriberServiceParams): VoiceLiveTranscriberService {
  const [status, setStatus] = useState<VoiceTranscriberStatus>("idle");
  const [level, setLevel] = useState(0);
  const elapsedSeconds = useElapsedSeconds(status);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep latest callbacks in refs so the stable SDK closures always see fresh values.
  const onTranscribeDeltaRef = useRef(onTranscribeDelta);
  onTranscribeDeltaRef.current = onTranscribeDelta;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const sendNotification = useSendNotification();

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

  const handleCommittedTranscript = useCallback(
    ({ text }: { text: string }) => {
      onTranscribeDeltaRef.current?.(text);
    },
    []
  );

  const handleError = useCallback(
    (err: Error | Event) => {
      const error =
        err instanceof Error ? err : new Error("Transcription error.");
      onErrorRef.current?.(error);
      cleanup();
      setStatus("idle");
    },
    [cleanup]
  );

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    audioFormat: AudioFormat.PCM_16000,
    sampleRate: 16000,
    commitStrategy: CommitStrategy.VAD,
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
      const audioContext = new AC({ sampleRate: 16000 });
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

      // ScriptProcessorNode captures raw PCM and forwards it to Scribe.
      // eslint-disable-next-line deprecation/deprecation
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      // ScriptProcessorNode must be connected to destination to fire onaudioprocess.
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = float32ToInt16(inputData);
        const b64 = arrayBufferToBase64(int16.buffer as ArrayBuffer);
        scribeRef.current.sendAudio(b64, { sampleRate: 16000 });
      };

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

    scribeRef.current.disconnect();
    cleanup();
    setStatus("idle");

    onTranscribeComplete?.();
  }, [status, onTranscribeComplete, cleanup]);

  return owner.metadata?.allowVoiceTranscription !== false
    ? { status, level, elapsedSeconds, startRecording, stopRecording }
    : quackingVoiceTranscriptService;
}
