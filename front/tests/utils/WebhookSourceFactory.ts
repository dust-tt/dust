import { faker } from "@faker-js/faker";

import { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import type { WorkspaceType } from "@app/types";
import type { WebhookSourceSignatureAlgorithm } from "@app/types/triggers/webhooks";

export class WebhookSourceFactory {
  private workspace: WorkspaceType;

  constructor(workspace: WorkspaceType) {
    this.workspace = workspace;
  }

  async create(
    options: {
      name?: string;
      secret?: string;
      urlSecret?: string;
      signatureHeader?: string;
      signatureAlgorithm?: WebhookSourceSignatureAlgorithm;
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
      urlSecret: options.urlSecret ?? faker.string.alphanumeric(64),
      secret: options.secret ?? null,
      signatureHeader: options.signatureHeader ?? null,
      signatureAlgorithm: options.signatureAlgorithm ?? null,
      customHeaders: options.customHeaders ?? null,
      kind: "custom",
      subscribedEvents: [],
    });

    return result;
  }
}
