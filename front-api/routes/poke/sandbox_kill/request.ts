import config from "@app/lib/api/config";
import type { SandboxKillRequestResponseBody } from "@app/lib/api/poke/types";
import { launchSandboxKillRequesterWorkflow } from "@app/temporal/sandbox_reaper/kill_requester/client";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const RequestBodySchema = z.object({
  baseImage: z.string().min(1),
  version: z.string().optional(),
});

function buildTemporalLink(workflowId: string): string {
  const temporalNamespace = config.getTemporalFrontNamespace() ?? "";
  return `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${encodeURIComponent(
    workflowId
  )}`;
}

// Mounted at /api/poke/sandbox_kill/request.
const app = pokeApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", RequestBodySchema),
  async (ctx): HandlerResult<SandboxKillRequestResponseBody> => {
    const payload = ctx.req.valid("json");

    const launched = await launchSandboxKillRequesterWorkflow(payload);
    if (launched.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to launch sandbox kill requester workflow: ${launched.error.message}`,
        },
      });
    }

    return ctx.json({
      workflowId: launched.value.workflowId,
      temporalLink: buildTemporalLink(launched.value.workflowId),
    });
  }
);

export default app;
