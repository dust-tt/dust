import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { WorkspaceType } from "@app/types";

import { WebhookSourceFactory } from "./WebhookSourceFactory";

export class WebhookSourceViewFactory {
  private workspace: WorkspaceType;

  constructor(workspace: WorkspaceType) {
    this.workspace = workspace;
  }

  async create(
    space: SpaceResource,
    options: {
      webhookSourceId?: number;
      customName?: string;
    } = {}
  ) {
    const auth = await Authenticator.internalAdminForWorkspace(
      this.workspace.sId
    );

    // If no webhook source ID provided, create one
    let webhookSourceId = options.webhookSourceId;
    if (!webhookSourceId) {
      const webhookSourceFactory = new WebhookSourceFactory(this.workspace);
      const webhookSourceResult = await webhookSourceFactory.create();
      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }
      webhookSourceId = webhookSourceResult.value.id;
    }

    const systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        webhookSourceId
      );

    // System view should be created on webhookSourceFactory.create();
    if (!systemView) {
      throw new Error("System view for webhook source not found");
    }

    // If the requested space is system space, return the system view
    if (space.kind === "system") {
      return systemView!;
    }

    // Otherwise create a view for the requested space
    return WebhookSourcesViewResource.create(auth, {
      systemView: systemView!,
      space,
    });
  }
}
