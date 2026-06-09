import * as React from "react";

const MAX_FAKE_PROGRESS_PERCENT = 99;
const PROGRESS_UPDATE_INTERVAL_MS = 1000;

const TRANSCRIPTION_BASE_DURATION_SECONDS = 3;
const BYTES_PER_TRANSCRIPTION_SECOND = 100000;
const RECORDING_SECONDS_PER_TRANSCRIPTION_SECOND = 15;

type TranscriptionEstimateInput =
  | { sizeBytes: number }
  | { recordingSeconds: number };

function estimateTranscriptionDurationMs(
  input: TranscriptionEstimateInput
): number {
  const baseDurationMs = TRANSCRIPTION_BASE_DURATION_SECONDS * 1000;

  if ("sizeBytes" in input) {
    return (
      baseDurationMs + (input.sizeBytes / BYTES_PER_TRANSCRIPTION_SECOND) * 1000
    );
  }

  return (
    baseDurationMs +
    (input.recordingSeconds / RECORDING_SECONDS_PER_TRANSCRIPTION_SECOND) * 1000
  );
}

export function useTranscribingProgress(
  props: { isTranscriptingInProgress: boolean } & TranscriptionEstimateInput
): number | null {
  const { isTranscriptingInProgress: isActive } = props;
  const estimatedTotalMs = estimateTranscriptionDurationMs(props);

  const [progress, setProgress] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!isActive) {
      setProgress(null);
      return;
    }
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
  }, [isActive, estimatedTotalMs]);

  return progress;
}
