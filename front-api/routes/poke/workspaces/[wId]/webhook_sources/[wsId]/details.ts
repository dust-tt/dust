import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { TriggerType } from "@app/types/assistant/triggers";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  WebhookSourceForAdminType,
  WebhookSourceViewForAdminType,
} from "@app/types/triggers/webhooks";
import type { UserType } from "@app/types/user";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeGetWebhookSourceDetails = {
  webhookSource: WebhookSourceForAdminType;
  views: WebhookSourceViewForAdminType[];
  triggers: Array<TriggerType & { editorUser: UserType | null }>;
  requestStats: { last24h: number; last7d: number; last30d: number };
};

// Mounted at /api/poke/workspaces/:wId/webhook_sources/:wsId/details.
const app = new Hono();

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

  const views = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    source.id
  );

  // Collect all triggers from all views
  const allTriggers: TriggerType[] = [];
  for (const view of views) {
    const triggers = await TriggerResource.listByWebhookSourceViewId(
      auth,
      view.id
    );
    for (const t of triggers) {
      allTriggers.push(t.toJSON());
    }
  }

  // Batch-fetch editor users
  const editorIds = removeNulls(allTriggers.map((t) => t.editor));
  const editorUsers =
    editorIds.length > 0 ? await UserResource.fetchByModelIds(editorIds) : [];
  const editorUserMap = new Map(editorUsers.map((u) => [u.id, u.toJSON()]));

  const triggersWithEditors = allTriggers.map((t) => ({
    ...t,
    editorUser: editorUserMap.get(t.editor) ?? null,
  }));

  const requestStats = await WebhookRequestResource.countBySourceInPeriods(
    auth,
    source.id
  );

  return ctx.json({
    webhookSource: source.toJSONForAdmin(),
    views: views.map((v) => v.toJSONForAdmin()),
    triggers: triggersWithEditors,
    requestStats,
  });
});

export default app;
