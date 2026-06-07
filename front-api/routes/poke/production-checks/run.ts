import { startManualCheckWorkflow } from "@app/temporal/production_checks/client";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type RunProductionCheckResponseBody = {
  workflowId: string;
  checkName: string;
};

const RunCheckRequestSchema = z.object({
  checkName: z.string(),
});

// Mounted at /api/poke/production-checks/run.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", RunCheckRequestSchema),
  async (ctx): HandlerResult<RunProductionCheckResponseBody> => {
    const { checkName } = ctx.req.valid("json");

    const result = await startManualCheckWorkflow(checkName);
    if (result.isErr()) {
      const isUnknownCheck = result.error.message.startsWith("Unknown check:");
      return apiError(ctx, {
        status_code: isUnknownCheck ? 400 : 500,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ workflowId: result.value, checkName });
  }
);

export default app;
