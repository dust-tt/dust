import {
  type GetWorkspaceProgrammaticCostResponse,
  getProgrammaticCost,
  ProgrammaticCostQuerySchema,
} from "@app/lib/api/analytics/programmatic_cost";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetWorkspaceProgrammaticCostResponse };

// Mounted at /api/w/:wId/analytics/programmatic-cost.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  validate("query", ProgrammaticCostQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const result = await getProgrammaticCost(auth, ctx.req.valid("query"));
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json(result.value);
  }
);

export default app;
