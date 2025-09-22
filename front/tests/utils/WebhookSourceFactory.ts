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
      secret?: string;
      signatureHeader?: string;
      signatureAlgorithm?: "sha1" | "sha256" | "sha512";
      customHeaders?: Record<string, string>;
    } = {}
  ) {
    const cachedName =
      options.name ?? "Test WebhookSource" + faker.number.int(1000);

    const auth = await Authenticator.internalAdminForWorkspace(
      this.workspace.sId
    );

    const result = await WebhookSourceResource.makeNew(auth, {
      workspaceId: this.workspace.id,
      name: cachedName,
      secret: options.secret ?? null,
      signatureHeader: options.signatureHeader ?? null,
      signatureAlgorithm: options.signatureAlgorithm ?? null,
      customHeaders: options.customHeaders ?? null,
    });

    return result;
  }
}
