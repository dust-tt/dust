import { apiError } from "@front-api/middlewares/utils";
import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
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
 *
 * `allowEmptyBody` (json target only) normalizes an empty request body to `{}`
 * before validation, for legacy clients that POST `Content-Type:
 * application/json` with no payload; Hono's json parsing would 400 on it.
 */
export function validate<
  Target extends keyof ValidationTargets,
  Schema extends ZodType,
>(
  target: Target,
  schema: Schema,
  { allowEmptyBody = false }: { allowEmptyBody?: boolean } = {}
) {
  const validator = zValidator(target, schema, (result, ctx) => {
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
  if (!allowEmptyBody || target !== "json") {
    return validator;
  }
  const normalizeEmptyBodyAndValidate: typeof validator = async (ctx, next) => {
    // Clone so the original body stays unread: the wrapped validator must be
    // the first consumer, or it would see Hono's cache of the empty payload.
    // Middleware has no non-mutating way to hand a rewritten body downstream;
    // `req.raw` is the public, mutable slot validators read lazily.
    if ((await ctx.req.raw.clone().text()).trim() === "") {
      ctx.req.raw = new Request(ctx.req.raw, { body: "{}" });
    }
    return validator(ctx, next);
  };
  return normalizeEmptyBodyAndValidate;
}
