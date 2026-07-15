// Import a function handler, optionally validate the request body against its
// declared schema, call its default fetch, and serialize the Response.

import {
  decodeRequestBody,
  type ErrorCode,
  type InvocationError,
  type Output,
  type RequestInput,
} from "./protocol.ts";

interface ZodLike {
  safeParse(
    data: unknown
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: unknown } };
}

function isValidator(value: unknown): value is ZodLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { safeParse?: unknown }).safeParse === "function"
  );
}

export async function invoke(
  handlerPath: string,
  input: RequestInput
): Promise<Output> {
  let handler: { fetch?: unknown };
  let schemaInput: unknown;
  let schemaOutput: unknown;
  try {
    const mod = await import(handlerPath);
    const def = mod.default;
    if (typeof def?.fetch !== "function") {
      throw new Error(
        "function must `export default { fetch(req) {...} }` with a fetch function"
      );
    }
    handler = def;
    schemaInput = (mod.schema as { input?: unknown } | undefined)?.input;
    schemaOutput = (mod.schema as { output?: unknown } | undefined)?.output;
  } catch (e) {
    return fail("import_failed", e);
  }

  const body = decodeRequestBody(input);

  if (isValidator(schemaInput)) {
    const validationError = validateBody(body, schemaInput);
    if (validationError) {
      return { ok: false, error: validationError };
    }
  }

  const request = new Request(input.url, {
    method: input.method,
    headers: input.headers,
    body: body as BodyInit | undefined,
  });

  let response: unknown;
  try {
    response = await (handler.fetch as (req: Request) => unknown)(request);
  } catch (e) {
    return fail("threw", e);
  }
  if (!(response instanceof Response)) {
    return fail(
      "bad_return",
      new Error(`function returned ${typeOf(response)}, expected a Response`)
    );
  }
  return parseOutput(response, schemaOutput);
}

function validateBody(
  body: Uint8Array | undefined,
  schema: ZodLike
): InvocationError | null {
  let data: unknown;
  if (body !== undefined) {
    try {
      data = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return {
        code: "invalid_input",
        message: "Function input is not valid JSON.",
      };
    }
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return null;
  }
  return {
    code: "invalid_input",
    message: `Function input does not match schema.input: ${JSON.stringify(parsed.error.issues)}`,
  };
}

async function parseOutput(
  response: Response,
  schemaOutput: unknown
): Promise<Output> {
  const body = await response.text();
  if (!response.ok) {
    return fail(
      "http_error",
      new Error(
        `Function returned HTTP ${response.status}${body ? `: ${body}` : "."}`
      ),
      response.status
    );
  }

  let output: unknown;
  try {
    output = JSON.parse(body);
  } catch {
    return fail(
      "invalid_output",
      new Error("Function response body is not valid JSON.")
    );
  }

  if (isValidator(schemaOutput)) {
    const parsed = schemaOutput.safeParse(output);
    if (!parsed.success) {
      return fail(
        "invalid_output",
        new Error(
          `Function output does not match schema.output: ${JSON.stringify(parsed.error.issues)}`
        )
      );
    }
    output = parsed.data;
  }

  return { ok: true, output };
}

function fail(code: ErrorCode, e: unknown, status?: number): Output {
  const err = e instanceof Error ? e : new Error(String(e));
  return {
    ok: false,
    error: {
      code,
      message: err.message,
      ...(status !== undefined ? { status } : {}),
    },
  };
}

function typeOf(v: unknown): string {
  if (v === null) {
    return "null";
  }
  if (Array.isArray(v)) {
    return "array";
  }
  return typeof v;
}
