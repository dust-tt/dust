import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_RUNNER_ERROR_CODES } from "@app/types/api/sandbox_functions";
import { z } from "zod";

type JsonValue = null | boolean | number | string | object;
const DefinedJsonValueSchema = z.custom<JsonValue>((v) => v !== undefined);

const SandboxFunctionRunnerOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), output: DefinedJsonValueSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum(SANDBOX_FUNCTION_RUNNER_ERROR_CODES),
          message: z.string(),
          status: z.number().int().optional(),
        })
        .strict(),
    })
    .strict(),
]);

const LegacySandboxFunctionRunnerOutputSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      response: z
        .object({
          status: z.number().int(),
          headers: z.record(z.string(), z.string()),
          body: z.string().nullable(),
          encoding: z.enum(["utf8", "base64"]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          kind: z.enum(["bad_input", "import_failed", "threw", "bad_return"]),
          message: z.string(),
          stack: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);

type NormalizedSandboxFunctionOutcome =
  | { ok: true; output: unknown }
  | { ok: false; error: SandboxFunctionCallError };

/**
 * Normalize a Pod function result payload from the HTTP callback body into one
 * classified outcome. Lifted from the callback route with no behavior change.
 */
export function normalizeSandboxFunctionResult(
  result: unknown
): NormalizedSandboxFunctionOutcome {
  const current = SandboxFunctionRunnerOutputSchema.safeParse(result);
  if (current.success) {
    return current.data;
  }

  const legacy = LegacySandboxFunctionRunnerOutputSchema.safeParse(result);
  if (!legacy.success) {
    return {
      ok: false,
      error: {
        code: "invocation_failed",
        message: "Sandbox function returned an invalid result envelope.",
      },
    };
  }

  if (!legacy.data.ok) {
    return {
      ok: false,
      error: {
        code: legacy.data.error.kind,
        message: legacy.data.error.message,
      },
    };
  }

  const { response } = legacy.data;
  const body =
    response.body === null
      ? ""
      : Buffer.from(response.body, response.encoding).toString("utf8");
  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      error: {
        code: "http_error",
        message: `Function returned HTTP ${response.status}${body ? `: ${body}` : "."}`,
        status: response.status,
      },
    };
  }

  try {
    return { ok: true, output: JSON.parse(body) };
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid_output",
        message: "Function response body is not valid JSON.",
      },
    };
  }
}
