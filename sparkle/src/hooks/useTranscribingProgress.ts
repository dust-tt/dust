import * as React from "react";

const TRANSCRIPTION_BASE_DURATION_SECONDS = 3;
const RECORDING_SECONDS_PER_TRANSCRIPTION_SECOND = 20;
const MAX_FAKE_PROGRESS_PERCENT = 99;
const PROGRESS_UPDATE_INTERVAL_MS = 100;

export function useTranscribingProgress({
  isRecording,
  isTranscribing,
  elapsedRecordingSeconds,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  elapsedRecordingSeconds: number;
}): number | null {
  const lastRecordingSecondsRef = React.useRef(0);
  const [progress, setProgress] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (isRecording) {
      lastRecordingSecondsRef.current = elapsedRecordingSeconds;
    }
  }, [isRecording, elapsedRecordingSeconds]);

  React.useEffect(() => {
    if (!isTranscribing) {
      setProgress(null);
      return;
    }
    const estimatedTotalMs =
      (TRANSCRIPTION_BASE_DURATION_SECONDS +
        lastRecordingSecondsRef.current /
          RECORDING_SECONDS_PER_TRANSCRIPTION_SECOND) *
      1000;
    const startedAt = Date.now();
    const update = (): void => {
      const elapsedMs = Date.now() - startedAt;
      setProgress(
        Math.min(
          MAX_FAKE_PROGRESS_PERCENT,
          Math.floor((elapsedMs / estimatedTotalMs) * 100)
        )
      );
    };
    update();
    const interval = window.setInterval(update, PROGRESS_UPDATE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isTranscribing]);

  return progress;
}
