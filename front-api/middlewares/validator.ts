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
