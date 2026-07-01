// Wire protocol for the function runner: JSON shapes exchanged on stdin/stdout
// and helpers translating request/response bodies to and from bytes.

export type Encoding = "utf8" | "base64";

export interface RequestInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  encoding: Encoding;
}

export interface ResponseOutput {
  status: number;
  headers: Record<string, string>;
  body: string | null;
  encoding: Encoding;
}

export type ErrorKind = "bad_input" | "import_failed" | "threw" | "bad_return";

export interface InvocationError {
  kind: ErrorKind;
  message: string;
  stack?: string;
}

export type Output =
  | { ok: true; response: ResponseOutput }
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
  return { method, url, headers, body, encoding };
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

export function encodeResponseBody(bytes: Uint8Array): {
  body: string | null;
  encoding: Encoding;
} {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { body: text, encoding: "utf8" };
  } catch {
    return { body: Buffer.from(bytes).toString("base64"), encoding: "base64" };
  }
}
