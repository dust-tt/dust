// Result type for explicit error handling (mirrors the dust-hive CLI pattern).

export type Result<T, E = ControlPlaneError> = { ok: true; value: T } | { ok: false; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// Error kinds map onto HTTP status codes at the server boundary.
export type ErrorKind =
  | "not_found"
  | "not_authorized"
  | "conflict"
  | "invalid_request"
  | "internal";

export class ControlPlaneError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "ControlPlaneError";
    this.kind = kind;
  }
}

export function notFound(message: string): ControlPlaneError {
  return new ControlPlaneError("not_found", message);
}

export function notAuthorized(message: string): ControlPlaneError {
  return new ControlPlaneError("not_authorized", message);
}

export function conflict(message: string): ControlPlaneError {
  return new ControlPlaneError("conflict", message);
}

export function invalidRequest(message: string): ControlPlaneError {
  return new ControlPlaneError("invalid_request", message);
}

export function internalError(message: string): ControlPlaneError {
  return new ControlPlaneError("internal", message);
}

// JS can throw anything (string, number, ...); coerce to a real Error so
// messages and logs are reliable.
export function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
