import { isSandboxFunctionInvocationTokenPayload } from "@app/lib/api/sandbox/access_tokens";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SandboxFunctionCallError } from "@app/types/api/sandbox_functions";
import { SANDBOX_FUNCTION_RUNNER_ERROR_CODES } from "@app/types/api/sandbox_functions";
import { sandboxApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
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

type NormalizedRunnerOutput =
  | { ok: true; output: unknown }
  | { ok: false; error: SandboxFunctionCallError };

function normalizeRunnerOutput(result: unknown): NormalizedRunnerOutput {
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

const PostSandboxFunctionResultRequestBodySchema = z
  .object({
    function: z.string().optional(),
    result: z.unknown(),
  })
  .strict();

// Mounted at /api/v1/w/:wId/sandbox/sandbox-functions/result. sandboxAuth is
// applied by the parent sandbox sub-app, so ctx.get("auth") and
// ctx.get("sandboxClaims") are always available here.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.post(
  "/",
  validate("json", PostSandboxFunctionResultRequestBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const sandboxClaims = ctx.get("sandboxClaims");
    const { function: functionName, result } = ctx.req.valid("json");

    void auth;
    void functionName;

    if (!isSandboxFunctionInvocationTokenPayload(sandboxClaims)) {
      return ctx.json({ success: true });
    }

    const sandboxFunction = await SandboxFunctionResource.fetchById(
      auth,
      sandboxClaims.sandboxFunctionId
    );
    if (!sandboxFunction) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox function not found.",
        },
      });
    }

    const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
      sandboxFunction,
      invocationId: sandboxClaims.invocationId,
    });
    if (!invocation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Sandbox function invocation not found.",
        },
      });
    }

    const normalized = normalizeRunnerOutput(result);
    if (normalized.ok) {
      await invocation.succeed(normalized.output);
    } else {
      await invocation.fail(normalized.error);
    }

    return ctx.json({ success: true });
  }
);

export default app;
