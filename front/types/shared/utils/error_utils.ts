import { DustError } from "@app/lib/error";

export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(errorToString(error));
}

export function normalizeAsInternalDustError(
  error: unknown
): DustError<"internal_error"> {
  if (error instanceof DustError && error.code === "internal_error") {
    return error;
  }

  return new DustError("internal_error", errorToString(error));
}
