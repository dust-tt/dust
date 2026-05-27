import { getWebhookSourcesUsage } from "@app/lib/api/agent_triggers";
import config from "@app/lib/api/config";
import { WEBHOOK_SERVICES } from "@app/lib/api/triggers/built-in-webhooks/services";
import { deleteWebhookSource } from "@app/lib/api/webhook_source";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateSecureSecret } from "@app/lib/resources/string_ids_server";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { buildWebhookUrl } from "@app/lib/webhook_source";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type {
  WebhookSourceForAdminType,
  WebhookSourceWithViewsAndUsageType,
} from "@app/types/triggers/webhooks";
import { WebhookSourcesSchema } from "@app/types/triggers/webhooks";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import webhookSourceById from "./[webhookSourceId]";
import serviceData from "./service-data";
import views from "./views";

export type GetWebhookSourcesResponseBody = {
  success: true;
  webhookSourcesWithViews: WebhookSourceWithViewsAndUsageType[];
};

export type PostWebhookSourcesResponseBody = {
  success: true;
  webhookSource: WebhookSourceForAdminType;
};

// Mounted at /api/w/:wId/webhook_sources.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWebhookSourcesResponseBody> => {
    const auth = ctx.get("auth");

    const webhookSourceResources =
      await WebhookSourceResource.listByWorkspace(auth);

    const usageBySourceId = await getWebhookSourcesUsage({ auth });
    const allViewResources =
      await WebhookSourcesViewResource.listByWebhookSourceIds(
        auth,
        webhookSourceResources.map((s) => s.id)
      );

    const viewsBySourceId = new Map<ModelId, WebhookSourcesViewResource[]>();
    for (const view of allViewResources) {
      const list = viewsBySourceId.get(view.webhookSourceId) ?? [];
      list.push(view);
      viewsBySourceId.set(view.webhookSourceId, list);
    }

    const webhookSourcesWithViews = webhookSourceResources.map((src) => {
      const webhookSource = src.toJSONForAdmin();
      const sourceViews = (viewsBySourceId.get(src.id) ?? []).map((v) =>
        v.toJSONForAdmin()
      );
      return {
        ...webhookSource,
        views: sourceViews,
        usage: usageBySourceId[webhookSource.id] ?? { count: 0, agents: [] },
      };
    });

    return ctx.json({
      success: true,
      webhookSourcesWithViews,
    });
  }
);

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", WebhookSourcesSchema),
  async (ctx): HandlerResult<PostWebhookSourcesResponseBody> => {
    const auth = ctx.get("auth");

    const {
      name,
      secret,
      signatureHeader,
      signatureAlgorithm,
      includeGlobal,
      subscribedEvents,
      provider,
      connectionId,
      remoteMetadata,
      icon,
      description,
    } = ctx.req.valid("json");

    if (provider && subscribedEvents.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Subscribed events must not be empty.",
        },
      });
    }

    const workspace = auth.getNonNullableWorkspace();

    const trimmedSignatureHeader = signatureHeader.trim();

    const existingWebhookSourceWithSameName =
      await WebhookSourceResource.fetchByName(auth, name);
    if (existingWebhookSourceWithSameName) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "A webhook source with the same name already exists.",
        },
      });
    }

    const webhookSource = await WebhookSourceResource.makeNew(
      auth,
      {
        workspaceId: workspace.id,
        name,
        secret:
          trimmedSignatureHeader.length === 0
            ? null
            : secret && secret.length > 0
              ? secret
              : generateSecureSecret(64),
        urlSecret: generateSecureSecret(64),
        provider,
        signatureHeader:
          trimmedSignatureHeader.length > 0 ? trimmedSignatureHeader : null,
        signatureAlgorithm,
        subscribedEvents,
      },
      { icon, description }
    );

    if (includeGlobal) {
      const systemView =
        await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
          auth,
          webhookSource.sId
        );

      if (systemView === null) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Missing system view for webhook source, it should have been created when creating the webhook source.",
          },
        });
      }

      const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

      await WebhookSourcesViewResource.create(auth, {
        systemView,
        space: globalSpace,
      });
    }

    if (provider && connectionId && remoteMetadata) {
      // Allow redirection to public URL in local dev for webhook registrations.
      const baseUrl =
        config.getDustWebhooksPublicUrl() ?? config.getApiBaseUrl();
      const webhookUrl = buildWebhookUrl({
        apiBaseUrl: baseUrl,
        workspaceId: workspace.sId,
        webhookSource: webhookSource.toJSONForAdmin(),
      });
      const service = WEBHOOK_SERVICES[provider];
      const result = await service.createWebhooks({
        auth,
        connectionId,
        remoteMetadata,
        webhookUrl,
        events: subscribedEvents,
        secret: webhookSource.getSecretPotentiallyRedacted() ?? undefined,
      });

      if (result.isErr()) {
        const deleteResult = await deleteWebhookSource(auth, webhookSource);
        if (deleteResult.isErr()) {
          logger.error(
            {
              error: deleteResult.error,
              webhookSourceId: webhookSource.sId,
            },
            "Failed to delete webhook source after remote webhook creation failed"
          );
        }

        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      const { updatedRemoteMetadata, secret: secretFromRemote } = result.value;

      await webhookSource.updateRemoteMetadata({
        remoteMetadata: updatedRemoteMetadata,
        oauthConnectionId: connectionId,
      });

      if (secretFromRemote) {
        await webhookSource.updateSecret(secretFromRemote);
      }
    }

    return ctx.json(
      { success: true, webhookSource: webhookSource.toJSONForAdmin() },
      201
    );
  }
);

// Register static paths BEFORE `/:webhookSourceId` so the param route does not
// swallow these names as ids.
app.route("/service-data", serviceData);
app.route("/views", views);
app.route("/:webhookSourceId", webhookSourceById);

export default app;
