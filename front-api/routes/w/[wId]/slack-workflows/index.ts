import {
  allowSlackWorkflow,
  listSlackWorkflows,
  revokeSlackWorkflow,
} from "@app/lib/api/slack/summoning_whitelist";
import type { GetSlackWorkflowsResponseBody } from "@app/types/api/slack/workflows";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withCreditPricedPlan } from "@front-api/middlewares/with_credit_priced_plan";
import { slackWorkflowErrorToApiError } from "@front-api/routes/slack_workflow_errors";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

import overview from "./overview";

export type { GetSlackWorkflowsResponseBody };

const PostBodySchema = z.object({
  botName: z.string().trim().min(1),
  spaceIds: z.array(z.string()),
});

const DeleteBodySchema = z.object({
  botName: z.string().trim().min(1),
});

// Mounted at /api/w/:wId/slack-workflows.
const app = workspaceApp();

app.route("/overview", overview);

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  withCreditPricedPlan(),
  async (ctx): HandlerResult<GetSlackWorkflowsResponseBody> => {
    const result = await listSlackWorkflows(ctx.get("auth"));
    if (result.isErr()) {
      return apiError(ctx, slackWorkflowErrorToApiError(result.error));
    }

    return ctx.json(result.value);
  }
);

/** @ignoreswagger */
app.post(
  "/",
  ensureIsAdmin(),
  withCreditPricedPlan(),
  validate("json", PostBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const { botName, spaceIds } = ctx.req.valid("json");

    const result = await allowSlackWorkflow(ctx.get("auth"), {
      botName,
      spaceIds,
    });
    if (result.isErr()) {
      return apiError(ctx, slackWorkflowErrorToApiError(result.error));
    }

    return ctx.json({ success: true });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  ensureIsAdmin(),
  withCreditPricedPlan(),
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
