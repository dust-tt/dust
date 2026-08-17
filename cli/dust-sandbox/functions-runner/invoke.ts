// Import a function handler, validate its input and output, and call its default fetch.

import { runWithInvocationEnv } from "./context.ts";
import {
  decodeRequestBody,
  type InvocationError,
  type NonHttpErrorCode,
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

interface FunctionHandler {
  fetch(request: Request): unknown;
}

function isValidator(value: unknown): value is ZodLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
}

function isFunctionHandler(value: unknown): value is FunctionHandler {
  return (
    typeof value === "object" &&
    value !== null &&
    "fetch" in value &&
    typeof value.fetch === "function"
  );
}

function getProperty(value: unknown, property: string): unknown {
  if (typeof value !== "object" || value === null || !(property in value)) {
    return undefined;
  }
  return value[property];
}

/**
 * Import a function handler and run one invocation.
 *
 * When `invocationEnv` is provided, the whole invocation (import included:
 * module top-level code runs on first import) executes inside a per-invocation
 * context carrying that environment, which @dust/pod reads through `podEnv()`.
 * This is how a resident server runs concurrent invocations with different
 * callers without touching process.env. Without it (cold runs, where the
 * process environment IS the invocation's), no context is entered and
 * @dust/pod falls back to process.env.
 */
export async function invoke(
  handlerPath: string,
  input: RequestInput,
  invocationEnv?: Readonly<Record<string, string>>
): Promise<Output> {
  if (invocationEnv !== undefined) {
    return runWithInvocationEnv(invocationEnv, () =>
      invokeInContext(handlerPath, input)
    );
  }
  return invokeInContext(handlerPath, input);
}

async function invokeInContext(
  handlerPath: string,
  input: RequestInput
): Promise<Output> {
  let handler: FunctionHandler;
  let schemaInput: unknown;
  let schemaOutput: unknown;
  try {
    const mod: unknown = await import(handlerPath);
    const def = getProperty(mod, "default");
    if (!isFunctionHandler(def)) {
      throw new Error(
        "function must `export default { fetch(req) {...} }` with a fetch function"
      );
    }
    handler = def;
    const schema = getProperty(mod, "schema");
    schemaInput = getProperty(schema, "input");
    schemaOutput = getProperty(schema, "output");
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
    response = await handler.fetch(request);
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
  try {
    const parsed = schema.safeParse(data);
    if (parsed.success) {
      return null;
    }
    return {
      code: "invalid_input",
      message: `Function input does not match schema.input: ${JSON.stringify(parsed.error.issues)}`,
    };
  } catch (error) {
    return makeError(
      "invalid_input",
      new Error(`schema.input validation threw: ${errorMessage(error)}`)
    );
  }
}

async function parseOutput(
  response: Response,
  schemaOutput: unknown
): Promise<Output> {
  const body = await response.text();
  if (!response.ok) {
    return failHttp(
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
    try {
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
    } catch (error) {
      return fail(
        "invalid_output",
        new Error(`schema.output validation threw: ${errorMessage(error)}`)
      );
    }
  }

  let serializedOutput: string | undefined;
  try {
    serializedOutput = JSON.stringify(output);
  } catch (error) {
    return fail(
      "invalid_output",
      new Error(
        `Function output is not JSON-serializable: ${errorMessage(error)}`
      )
    );
  }
  if (serializedOutput === undefined) {
    return fail(
      "invalid_output",
      new Error("Function output is not JSON-serializable.")
    );
  }

  return { ok: true, output: JSON.parse(serializedOutput) };
}

function makeError(code: NonHttpErrorCode, error: unknown): InvocationError {
  return { code, message: errorMessage(error) };
}

function fail(code: NonHttpErrorCode, error: unknown): Output {
  return { ok: false, error: makeError(code, error) };
}

function failHttp(error: unknown, status: number): Output {
  return {
    ok: false,
    error: { code: "http_error", message: errorMessage(error), status },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
