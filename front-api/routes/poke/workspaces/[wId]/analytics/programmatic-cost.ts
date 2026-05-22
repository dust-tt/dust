import {
  type GetWorkspaceProgrammaticCostResponse,
  getProgrammaticCost,
  ProgrammaticCostQuerySchema,
} from "@app/lib/api/analytics/programmatic_cost";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { GetWorkspaceProgrammaticCostResponse };

// Mounted at /api/poke/workspaces/:wId/analytics/programmatic-cost.
const app = pokeApp();

app.get("/", validate("query", ProgrammaticCostQuerySchema), async (ctx) => {
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
});

export default app;
