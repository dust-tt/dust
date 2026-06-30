// Import a function handler, optionally validate the request body against its
// declared schema, call its default fetch, and serialize the Response.

import {
  decodeRequestBody,
  encodeResponseBody,
  type Output,
  type RequestInput,
} from "./protocol.ts";

interface ZodLike {
  safeParse(
    data: unknown
  ): { success: true } | { success: false; error: { issues: unknown } };
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
  } catch (e) {
    return fail("import_failed", e);
  }

  const body = decodeRequestBody(input);

  if (isValidator(schemaInput)) {
    const rejection = validateBody(body, schemaInput);
    if (rejection) {
      return serialize(rejection);
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
  return serialize(response);
}

function validateBody(
  body: Uint8Array | undefined,
  schema: ZodLike
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

async function serialize(response: Response): Promise<Output> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { body, encoding } = encodeResponseBody(bytes);
  return {
    ok: true,
    response: {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body,
      encoding,
    },
  };
}

function fail(
  kind: "import_failed" | "threw" | "bad_return",
  e: unknown
): Output {
  const err = e instanceof Error ? e : new Error(String(e));
  return { ok: false, error: { kind, message: err.message, stack: err.stack } };
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
