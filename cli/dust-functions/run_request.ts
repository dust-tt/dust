#!/usr/bin/env bun
// run_request — invoke a Web-standard fetch handler as if serving one HTTP
// request, without running a server.
//
//   run_request ./handler.ts < request.json   →   response.json on stdout
//
// Input/output wire format lives in protocol.ts.

import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import {
  BadInputError,
  decodeRequestBody,
  encodeResponseBody,
  type Output,
  parseInput,
  type RequestInput,
} from "./protocol.ts";

/**
 * Import a handler file, build a Request from `input`, call the handler, and
 * return its Response (or a structured failure). Never throws.
 */
export async function invoke(
  handlerPath: string,
  input: RequestInput
): Promise<Output> {
  // Load the handler (and its optional input schema).
  let handler: { fetch?: unknown };
  let inputSchema: z.ZodType | undefined;
  try {
    // Resolve relative paths against the caller's working directory, not this
    // module's location (which is where a bare dynamic import would look).
    const spec = isAbsolute(handlerPath)
      ? handlerPath
      : resolve(process.cwd(), handlerPath);
    const mod = await import(spec);
    const def = mod.default;
    if (typeof def?.fetch !== "function") {
      throw new Error(
        "handler must `export default { fetch(req) {...} }` with a fetch function"
      );
    }
    handler = def;
    const declared = (mod.schema as { input?: unknown } | undefined)?.input;
    if (declared instanceof z.ZodType) {
      inputSchema = declared;
    }
  } catch (e) {
    return fail("import_failed", e);
  }

  const body = decodeRequestBody(input);

  // Validate the request body against the handler's declared input schema, if
  // any. A rejection is a normal HTTP 400 response (a successful invocation
  // that refused bad input), not an invocation failure.
  if (inputSchema) {
    const rejection = validateBody(body, inputSchema);
    if (rejection) {
      return serialize(rejection);
    }
  }

  // Build the Request.
  const request = new Request(input.url, {
    method: input.method,
    headers: input.headers,
    body: body as BodyInit | undefined,
  });

  // Call the handler.
  let response: unknown;
  try {
    response = await (handler.fetch as (req: Request) => unknown)(request);
  } catch (e) {
    return fail("threw", e);
  }

  if (!(response instanceof Response)) {
    return fail(
      "bad_return",
      new Error(`handler returned ${typeOf(response)}, expected a Response`)
    );
  }

  return serialize(response);
}

/**
 * Parse `body` as JSON and validate it against `schema`. Returns a 400 Response
 * describing the problem, or null if the body is valid.
 */
function validateBody(
  body: Uint8Array | undefined,
  schema: z.ZodType
): Response | null {
  let data: unknown;
  if (body !== undefined) {
    try {
      data = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return Response.json(
        {
          error: "invalid input",
          issues: [{ message: "body is not valid JSON" }],
        },
        { status: 400 }
      );
    }
  }

  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return null;
  }
  return Response.json(
    { error: "invalid input", issues: parsed.error.issues },
    { status: 400 }
  );
}

/** Serialize a Response into the wire output (always ok: true). */
async function serialize(response: Response): Promise<Output> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { body: outBody, encoding } = encodeResponseBody(bytes);
  return {
    ok: true,
    response: {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: outBody,
      encoding,
    },
  };
}

function fail(
  kind: "import_failed" | "threw" | "bad_return",
  e: unknown
): Output {
  const err = e instanceof Error ? e : new Error(String(e));
  return {
    ok: false,
    error: { kind, message: err.message, stack: err.stack },
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

async function main(): Promise<void> {
  const handlerPath = process.argv[2];
  if (!handlerPath) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: {
          kind: "bad_input",
          message: "usage: run_request <handler> < request.json",
        },
      }) + "\n"
    );
    process.exit(2);
  }

  const raw = await Bun.stdin.text();

  let input: RequestInput;
  try {
    input = parseInput(raw);
  } catch (e) {
    const message = e instanceof BadInputError ? e.message : String(e);
    process.stdout.write(
      JSON.stringify({ ok: false, error: { kind: "bad_input", message } }) +
        "\n"
    );
    process.exit(2);
  }

  const out = await invoke(handlerPath, input);
  process.stdout.write(JSON.stringify(out) + "\n");
  process.exit(out.ok ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
