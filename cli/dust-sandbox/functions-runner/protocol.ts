// Wire protocol for the function runner: JSON shapes exchanged on stdin/stdout
// and the helper translating request bodies to bytes.

export type Encoding = "utf8" | "base64";

export interface RequestInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  encoding: Encoding;
  // Sha256 hex of the bundle the publisher expects to run. The warm server
  // refuses to serve an import that does not match (see serve.ts); the cold
  // runner ignores it, since a cold run reads the bundle straight from disk.
  bundleSha256?: string;
}

export const RUNNER_ERROR_CODES = [
  "bad_input",
  "invalid_input",
  "import_failed",
  "threw",
  "bad_return",
  "http_error",
  "invalid_output",
  // Emitted by the warm server's admission layer (serve.ts), never by
  // invoke(): the function is at its concurrency limit and the invocation
  // was refused before anything executed.
  "overloaded",
  // Minted by dsbx (src/commands/function/run.rs), never by this runner: the
  // runner's stdout envelope was cut mid-JSON in transit, so the function ran
  // but its result was lost. Listed here so front's mirror of the wire enum
  // stays a single aligned list.
  "output_truncated",
  // The serialized result exceeds the hard size cap; the function must store
  // large data in a pod file or database and return a pointer instead.
  "output_too_large",
] as const;

export type ErrorCode = (typeof RUNNER_ERROR_CODES)[number];

export type NonHttpErrorCode = Exclude<ErrorCode, "http_error">;

export type InvocationError =
  | { code: NonHttpErrorCode; message: string }
  | { code: "http_error"; message: string; status: number };

export type Output =
  | { ok: true; output: unknown }
  | { ok: false; error: InvocationError };

export class BadInputError extends Error {}

export function parseInput(raw: string): RequestInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new BadInputError(
      `stdin is not valid JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new BadInputError("input must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.url !== undefined && typeof obj.url !== "string") {
    throw new BadInputError("input.url must be a string");
  }
  const url = obj.url === undefined ? "http://localhost/" : obj.url;
  const method = obj.method === undefined ? "GET" : obj.method;
  if (typeof method !== "string") {
    throw new BadInputError("input.method must be a string");
  }
  let headers: Record<string, string> = {};
  if (obj.headers !== undefined) {
    if (typeof obj.headers !== "object" || obj.headers === null) {
      throw new BadInputError("input.headers must be an object");
    }
    headers = obj.headers as Record<string, string>;
  }
  if (
    obj.body !== undefined &&
    obj.body !== null &&
    typeof obj.body !== "string"
  ) {
    throw new BadInputError("input.body must be a string");
  }
  const body = typeof obj.body === "string" ? obj.body : undefined;
  const encoding = obj.encoding === undefined ? "utf8" : obj.encoding;
  if (encoding !== "utf8" && encoding !== "base64") {
    throw new BadInputError('input.encoding must be "utf8" or "base64"');
  }
  if (obj.bundleSha256 !== undefined && typeof obj.bundleSha256 !== "string") {
    throw new BadInputError("input.bundleSha256 must be a string");
  }
  const bundleSha256 =
    typeof obj.bundleSha256 === "string" ? obj.bundleSha256 : undefined;
  return { method, url, headers, body, encoding, bundleSha256 };
}

export function decodeRequestBody(input: RequestInput): Uint8Array | undefined {
  if (input.body === undefined) {
    return undefined;
  }
  if (input.encoding === "base64") {
    return new Uint8Array(Buffer.from(input.body, "base64"));
  }
  return new TextEncoder().encode(input.body);
}
