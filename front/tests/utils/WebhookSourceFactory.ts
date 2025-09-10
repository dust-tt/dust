import { faker } from "@faker-js/faker";

import { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import type { WorkspaceType } from "@app/types";

export class WebhookSourceFactory {
  private workspace: WorkspaceType;

  constructor(workspace: WorkspaceType) {
    this.workspace = workspace;
  }

  async create(
    options: {
      name?: string;
    } = {}
  ) {
    const cachedName =
      options.name || "Test WebhookSource" + faker.number.int(1000);

    const auth = await Authenticator.internalAdminForWorkspace(
      this.workspace.sId
    );

    const result = await WebhookSourceResource.makeNew(auth, {
      workspaceId: this.workspace.id,
      name: cachedName,
    });

    return result;
  }
}
