import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
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

    const customName = options.customName || null;

    // First create a system space view (required for creation)
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    let systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        webhookSourceId
      );

    // If no system view exists, create one using the private makeNew method
    if (!systemView) {
      systemView = await (WebhookSourcesViewResource as any).makeNew(
        auth,
        {
          webhookSourceId,
          customName,
        },
        systemSpace,
        auth.user() ?? undefined
      );
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
