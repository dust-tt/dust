import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/w/:wId/triggers/:tId/webhook_requests.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { tId } = ctx.req.valid("param");

  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "Trigger not found.",
      },
    });
  }

  // @cc [owner:frankaloia,label:security] webhook-requests-ownership
  // Only the trigger's editor or a workspace manager/admin may read its
  // stored webhook payloads. Any other workspace member MUST receive 403.
  if (!auth.isManager() && !trigger.isEditedBy(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only managers, admins, or the editor of the" +
          " trigger can view its webhook requests.",
      },
    });
  }

  try {
    const r = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
      trigger: trigger.toJSON(),
      limit: 15,
    });
    return ctx.json({ requests: r });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        tId,
      },
      "Error fetching webhook requests"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch webhook requests.",
      },
    });
  }
});

export default app;
