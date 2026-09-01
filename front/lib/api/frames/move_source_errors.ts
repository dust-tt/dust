import { Err } from "@app/types/shared/result";

export class FrameSourceMoveError extends Error {
  constructor(
    readonly code:
      | "commit_failed"
      | "conflict"
      | "copy_failed"
      | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameSourceMoveError";
  }
}

export function isFrameSourceMoveError(
  error: unknown
): error is FrameSourceMoveError {
  return error instanceof FrameSourceMoveError;
}

export function frameSourceMoveError(
  code: FrameSourceMoveError["code"],
  message: string
) {
  return new Err(new FrameSourceMoveError(code, message));
}
