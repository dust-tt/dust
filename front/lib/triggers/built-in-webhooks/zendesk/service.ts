import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { ZendeskWebhookStoredMetadata } from "@app/lib/triggers/built-in-webhooks/zendesk/types";
import logger from "@app/logger/logger";
import type { Result, WorkspaceType } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";
import type { NoAdditionalData } from "@app/types/triggers/webhooks";

export class ZendeskWebhookService implements RemoteWebhookService<"zendesk"> {
  async setupZendeskConnection({
    connectionId,
    auth,
  }: {
    connectionId: string;
    auth: Authenticator;
  }): Promise<
    Result<
      {
        accessToken: string;
        zendeskSubdomain: string;
        workspace: WorkspaceType;
      },
      Error
    >
  > {
    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    // Verify the connection belongs to this workspace
    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId: connectionId,
    });

    if (metadataRes.isErr()) {
      return new Err(new Error("Zendesk connection not found"));
    }
    const workspace = auth.getNonNullableWorkspace();

    const workspaceId = metadataRes.value.connection.metadata.workspace_id;
    if (!workspaceId || workspaceId !== workspace.sId) {
      return new Err(new Error("Connection does not belong to this workspace"));
    }

    const zendeskSubdomain =
      metadataRes.value.connection.metadata.zendesk_subdomain;
    if (!zendeskSubdomain || typeof zendeskSubdomain !== "string") {
      return new Err(new Error("Zendesk subdomain not found in connection"));
    }

    const tokenRes = await oauthAPI.getAccessToken({
      connectionId: connectionId,
    });

    if (tokenRes.isErr()) {
      return new Err(new Error("Failed to get Zendesk access token"));
    }

    return new Ok({
      accessToken: tokenRes.value.access_token,
      zendeskSubdomain: zendeskSubdomain,
      workspace: workspace,
    });
  }

  async getServiceData(
    _oauthToken: string
  ): Promise<Result<NoAdditionalData, Error>> {
    return new Ok({});
  }

  async createWebhooks({
    auth,
    connectionId,
    webhookUrl,
    events,
    secret,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: NoAdditionalData;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: ZendeskWebhookStoredMetadata;
        errors?: string[];
      },
      Error
    >
  > {
    const connectionRes = await this.setupZendeskConnection({
      connectionId,
      auth,
    });

    if (connectionRes.isErr()) {
      return connectionRes;
    }

    const { accessToken, zendeskSubdomain } = connectionRes.value;
    const workspace = auth.getNonNullableWorkspace();

    // Create the webhook in Zendesk
    const webhookPayload = {
      webhook: {
        name: `Dust Webhook - ${workspace.name} - ${new Date().toISOString()}`,
        endpoint: webhookUrl,
        http_method: "POST",
        request_format: "json",
        status: "active",
        subscriptions: events,
        ...(secret && { signing_secret: { secret } }),
      },
    };

    const response = await fetch(
      `https://${zendeskSubdomain}.zendesk.com/api/v2/webhooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(webhookPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Failed to create Zendesk webhook: ${response.status} ${response.statusText} - ${errorText}`
        )
      );
    }

    const data = await response.json();
    const webhookId = data.webhook?.id;

    if (!webhookId) {
      return new Err(
        new Error("Webhook created but no ID returned from Zendesk")
      );
    }

    return new Ok({
      updatedRemoteMetadata: {
        webhookId: String(webhookId),
        zendeskSubdomain,
      },
    });
  }

  async deleteWebhooks({
    auth,
    connectionId,
    remoteMetadata,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: ZendeskWebhookStoredMetadata;
  }): Promise<Result<void, Error>> {
    const connectionRes = await this.setupZendeskConnection({
      connectionId,
      auth,
    });

    if (connectionRes.isErr()) {
      return connectionRes;
    }

    const { accessToken, zendeskSubdomain } = connectionRes.value;

    const webhookId = remoteMetadata.webhookId;

    if (!webhookId) {
      return new Err(new Error("Webhook ID not found in remote metadata"));
    }

    const response = await fetch(
      `https://${zendeskSubdomain}.zendesk.com/api/v2/webhooks/${webhookId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn(
        `Failed to delete Zendesk webhook: ${response.status} ${response.statusText} - ${errorText}`
      );

      return new Err(
        new Error(`Failed to delete Zendesk webhook: ${errorText}`)
      );
    }

    return new Ok(undefined);
  }
}
