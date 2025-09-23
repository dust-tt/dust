export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (
    error &&
    typeof error === "object" &&
    "message" in (error as Record<string, unknown>) &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  // Preserve name if present on non-Error objects (e.g., DOMException 'AbortError').
  let name: string | undefined = undefined;
  if (
    error &&
    typeof error === "object" &&
    "name" in (error as Record<string, unknown>) &&
    typeof (error as { name?: unknown }).name === "string"
  ) {
    name = (error as { name: string }).name;
  }

  const e = new Error(errorToString(error));
  if (name) {
    e.name = name;
  }
  return e;
}

