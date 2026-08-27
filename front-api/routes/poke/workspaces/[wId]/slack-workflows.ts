import {
  listSlackWorkflows,
  revokeSlackWorkflow,
} from "@app/lib/api/slack/summoning_whitelist";
import type { GetSlackWorkflowsResponseBody } from "@app/types/api/slack/workflows";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { slackWorkflowErrorToApiError } from "@front-api/routes/slack_workflow_errors";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const DeleteBodySchema = z.object({
  botName: z.string().trim().min(1),
});

// Mounted at /api/poke/workspaces/:wId/slack-workflows.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSlackWorkflowsResponseBody> => {
  const result = await listSlackWorkflows(ctx.get("auth"));
  if (result.isErr()) {
    return apiError(ctx, slackWorkflowErrorToApiError(result.error));
  }

  return ctx.json(result.value);
});

/** @ignoreswagger */
app.delete(
  "/",
  validate("json", DeleteBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const { botName } = ctx.req.valid("json");

    const result = await revokeSlackWorkflow(ctx.get("auth"), { botName });
    if (result.isErr()) {
      return apiError(ctx, slackWorkflowErrorToApiError(result.error));
    }

    return ctx.json({ success: true });
  }
);

export default app;
