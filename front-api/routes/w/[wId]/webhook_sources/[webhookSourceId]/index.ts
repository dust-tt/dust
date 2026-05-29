import { deleteWebhookSource } from "@app/lib/api/webhook_source";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

import triggerEstimation from "./trigger-estimation";
import views from "./views";

// Field values are validated as `unknown` so unexpected types are silently
// dropped by the handler instead of rejected with 400 — preserving the
// permissive contract that older clients depend on.
const PatchWebhookSourceBodySchema = z.object({
  remoteMetadata: z.unknown().optional(),
  oauthConnectionId: z.unknown().optional(),
});

// Mounted at /api/w/:wId/webhook_sources/:webhookSourceId.
const app = workspaceApp();

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchWebhookSourceBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const webhookSourceId = ctx.req.param("webhookSourceId") ?? "";

    const { remoteMetadata, oauthConnectionId } = ctx.req.valid("json");

    const webhookSourceResource = await WebhookSourceResource.fetchById(
      auth,
      webhookSourceId
    );

    if (!webhookSourceResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "webhook_source_not_found",
          message: "The webhook source you're trying to update was not found.",
        },
      });
    }

    const updates: {
      remoteMetadata?: Record<string, unknown>;
      oauthConnectionId?: string;
    } = {};

    if (
      remoteMetadata !== null &&
      typeof remoteMetadata === "object" &&
      !Array.isArray(remoteMetadata)
    ) {
      updates.remoteMetadata = { ...remoteMetadata };
    }
    if (oauthConnectionId && typeof oauthConnectionId === "string") {
      updates.oauthConnectionId = oauthConnectionId;
    }

    await webhookSourceResource.updateRemoteMetadata(updates);

    return ctx.json({ success: true });
  }
);

app.delete(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const webhookSourceId = ctx.req.param("webhookSourceId") ?? "";

    const webhookSourceResource = await WebhookSourceResource.fetchById(
      auth,
      webhookSourceId
    );

    if (!webhookSourceResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "webhook_source_not_found",
          message: "The webhook source you're trying to delete was not found.",
        },
      });
    }

    const deleteResult = await deleteWebhookSource(auth, webhookSourceResource);
    if (deleteResult.isErr()) {
      throw deleteResult.error;
    }

    return ctx.json({ success: true });
  }
);

app.route("/trigger-estimation", triggerEstimation);
app.route("/views", views);

export default app;
