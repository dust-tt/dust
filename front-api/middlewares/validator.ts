import { apiError } from "@front-api/middlewares/utils";
import { zValidator } from "@hono/zod-validator";
import type { Env, MiddlewareHandler, ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { fromError } from "zod-validation-error";

const TARGET_LABEL: Record<keyof ValidationTargets, string> = {
  json: "request body",
  form: "request body",
  query: "query parameters",
  param: "path parameters",
  header: "request headers",
  cookie: "cookies",
};

/**
 * Wraps `@hono/zod-validator` so failures match our standard
 * `{ error: { type, message } }` shape instead of the validator's default.
 */
export function validate<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(target: Target, schema: Schema) {
  return zValidator(target, schema, (result, ctx) => {
    if (!result.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid ${TARGET_LABEL[target]}: ${fromError(result.error).toString()}`,
        },
      });
    }
  });
}

// Existing clients POST `Content-Type: application/json` with an empty body.
// Hono's json validator parses before Zod and 400s on that payload, so empty
// bodies are normalized to `{}` here, then validated as usual.
export function validateJsonAllowingEmpty<
  Schema extends ZodType,
  E extends Env = Env,
  P extends string = string,
>(
  schema: Schema
): MiddlewareHandler<
  E,
  P,
  {
    in: { json: Schema["_input"] };
    out: { json: Schema["_output"] };
  }
> {
  return async (ctx, next) => {
    const raw = await ctx.req.text();
    let parsed: unknown = {};
    if (raw.trim() !== "") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body: malformed JSON",
          },
        });
      }
    }
    const result = await schema.safeParseAsync(parsed);
    if (!result.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid request body: ${fromError(result.error).toString()}`,
        },
      });
    }

    ctx.req.addValidatedData("json", result.data);
    await next();
  };
}
