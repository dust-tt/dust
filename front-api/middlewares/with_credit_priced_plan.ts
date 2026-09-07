import { isCreditPricedPlan } from "@app/types/plan";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { createMiddleware } from "hono/factory";

export function withCreditPricedPlan({
  message = "This feature is only available on credit-priced plans.",
}: {
  message?: string;
} = {}) {
  return createMiddleware<WorkspaceAwareCtx>(async (ctx, next) => {
    const plan = ctx.get("auth").plan();

    if (!plan || !isCreditPricedPlan(plan)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "plan_limit_error",
          message,
        },
      });
    }

    await next();
  });
}
