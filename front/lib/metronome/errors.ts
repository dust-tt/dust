import { ConflictError } from "@metronome/sdk";

export function isMetronomeConflictError(
  error: unknown
): error is ConflictError {
  return error instanceof ConflictError;
}
