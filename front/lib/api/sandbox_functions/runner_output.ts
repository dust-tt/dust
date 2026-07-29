import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_RUNNER_ERROR_CODES } from "@app/types/api/sandbox_functions";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { z } from "zod";

type JsonValue = null | boolean | number | string | object;
const DefinedJsonValueSchema = z.custom<JsonValue>(
  (value) => value !== undefined
);
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

export type NormalizedSandboxFunctionRunnerOutput =
  | { ok: true; output: unknown }
  | { ok: false; error: SandboxFunctionCallError };

export function parseSandboxFunctionRunnerOutput(
  result: unknown
): Result<NormalizedSandboxFunctionRunnerOutput, Error> {
  const current = SandboxFunctionRunnerOutputSchema.safeParse(result);
  if (current.success) {
    return new Ok(current.data);
  }

  const legacy = LegacySandboxFunctionRunnerOutputSchema.safeParse(result);
  if (!legacy.success) {
    return new Err(
      new Error("Sandbox function returned an invalid result envelope.")
    );
  }

  if (!legacy.data.ok) {
    return new Ok({
      ok: false,
      error: {
        code: legacy.data.error.kind,
        message: legacy.data.error.message,
      },
    });
  }

  const { response } = legacy.data;
  const body =
    response.body === null
      ? ""
      : Buffer.from(response.body, response.encoding).toString("utf8");
  if (response.status < 200 || response.status >= 300) {
    return new Ok({
      ok: false,
      error: {
        code: "http_error",
        message: `Function returned HTTP ${response.status}${body ? `: ${body}` : "."}`,
        status: response.status,
      },
    });
  }

  const parsedBody = safeParseJSON(body);
  if (parsedBody.isErr()) {
    return new Ok({
      ok: false,
      error: {
        code: "invalid_output",
        message: "Function response body is not valid JSON.",
      },
    });
  }

  return new Ok({ ok: true, output: parsedBody.value });
}

export function normalizeSandboxFunctionRunnerOutput(
  result: unknown
): NormalizedSandboxFunctionRunnerOutput {
  const parsed = parseSandboxFunctionRunnerOutput(result);
  if (parsed.isOk()) {
    return parsed.value;
  }

  return {
    ok: false,
    error: {
      code: "invocation_failed",
      message: parsed.error.message,
    },
  };
}
