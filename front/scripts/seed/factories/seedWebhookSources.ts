import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

import type { SeedContext } from "./types";

export interface WebhookSourceAsset {
  name: string;
  provider: WebhookProvider | null;
  subscribedEvents: string[];
  description: string;
  icon: string;
}

export interface CreatedWebhookSourceView {
  webhookSourceSId: string;
  viewId: number;
  name: string;
}

export async function seedWebhookSources(
  ctx: SeedContext,
  assets: WebhookSourceAsset[]
): Promise<Map<string, CreatedWebhookSourceView>> {
  const { auth, execute, logger } = ctx;
  const workspace = auth.getNonNullableWorkspace();
  const created = new Map<string, CreatedWebhookSourceView>();

  // Fetch global space once — views must exist here to be visible to members.
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  for (const asset of assets) {
    // Check if already exists
    const existing = await WebhookSourceResource.fetchByName(auth, asset.name);
    if (existing) {
      logger.info(
        { name: asset.name },
        "Webhook source already exists, skipping"
      );

      // Still need to fetch the system view for linking triggers
      const systemView =
        await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
          auth,
          existing.sId
        );
      if (systemView) {
        created.set(asset.name, {
          webhookSourceSId: existing.sId,
          viewId: systemView.id,
          name: asset.name,
        });

        // Ensure a view exists in the global space so members can see it.
        if (execute) {
          await ensureGlobalSpaceView(auth, systemView, globalSpace, logger);
        }
      }
      continue;
    }

    if (execute) {
      const webhookSource = await WebhookSourceResource.makeNew(
        auth,
        {
          workspaceId: workspace.id,
          name: asset.name,
          urlSecret: crypto.randomUUID().replace(/-/g, ""),
          secret: null,
          signatureHeader: null,
          signatureAlgorithm: null,
          provider: asset.provider,
          subscribedEvents: asset.subscribedEvents,
        },
        {
          icon: asset.icon,
          description: asset.description,
        }
      );

      // Fetch the auto-created system space view
      const systemView =
        await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
          auth,
          webhookSource.sId
        );
      if (!systemView) {
        throw new Error(
          `System view not found for webhook source ${asset.name}`
        );
      }

      // Also create a view in the global space so members can see it.
      await ensureGlobalSpaceView(auth, systemView, globalSpace, logger);

      created.set(asset.name, {
        webhookSourceSId: webhookSource.sId,
        viewId: systemView.id,
        name: asset.name,
      });

      logger.info(
        { name: asset.name, provider: asset.provider },
        "Webhook source created"
      );
    } else {
      logger.info(
        { name: asset.name },
        "Would create webhook source (dry run)"
      );
    }
  }

  return created;
}

async function ensureGlobalSpaceView(
  auth: Authenticator,
  systemView: WebhookSourcesViewResource,
  globalSpace: SpaceResource,
  logger: SeedContext["logger"]
) {
  const existingViews = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    systemView.webhookSourceId
  );
  const hasGlobalView = existingViews.some(
    (v) => v.space.sId === globalSpace.sId
  );
  if (!hasGlobalView) {
    await WebhookSourcesViewResource.create(auth, {
      systemView,
      space: globalSpace,
    });
    logger.info(
      { webhookSourceId: systemView.webhookSourceId },
      "Created global space view for webhook source"
    );
  }
}
