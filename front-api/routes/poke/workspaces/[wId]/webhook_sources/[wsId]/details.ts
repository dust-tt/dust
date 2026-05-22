import { getWebhookSourceAdminDetails } from "@app/lib/api/webhook_source";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import type { TriggerType } from "@app/types/assistant/triggers";
import type {
  WebhookSourceForAdminType,
  WebhookSourceViewForAdminType,
} from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type PokeGetWebhookSourceDetails = {
  webhookSource: WebhookSourceForAdminType;
  views: WebhookSourceViewForAdminType[];
  triggers: Array<TriggerType & { editorUser: UserType | null }>;
  requestStats: { last24h: number; last7d: number; last30d: number };
};

// Mounted at /api/poke/workspaces/:wId/webhook_sources/:wsId/details.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeGetWebhookSourceDetails> => {
  const auth = ctx.get("auth");
  const wsId = ctx.req.param("wsId");
  if (!wsId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid webhook source ID.",
      },
    });
  }

  const source = await WebhookSourceResource.fetchById(auth, wsId);
  if (!source) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "webhook_source_not_found",
        message: "Webhook source not found.",
      },
    });
  }

  const details = await getWebhookSourceAdminDetails(auth, source);

  return ctx.json(details);
});

export default app;
