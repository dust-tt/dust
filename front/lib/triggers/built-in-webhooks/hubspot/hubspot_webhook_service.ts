import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { HubspotAdditionalData } from "@app/lib/triggers/built-in-webhooks/hubspot/hubspot_service_types";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class HubspotWebhookService implements RemoteWebhookService {
  async getServiceData(): Promise<Result<HubspotAdditionalData, Error>> {
    // Get the webhook-specific app ID from config
    const appId = config.getOAuthHubspotAppWebhooksClientId();

    return new Ok({
      appId,
    });
  }

  async createWebhooks({
    auth,
    connectionId,
    remoteMetadata,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: HubspotAdditionalData;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: Record<string, any>;
        errors?: string[];
      },
      Error
    >
  > {
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

      // Verify the connection belongs to this workspace
      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        return new Err(new Error("HubSpot connection not found"));
      }

      const workspace = auth.getNonNullableWorkspace();

      const workspaceId = metadataRes.value.connection.metadata.workspace_id;
      if (!workspaceId || workspaceId !== workspace.sId) {
        return new Err(
          new Error("Connection does not belong to this workspace")
        );
      }

      // No server-side API calls needed - webhooks are configured manually in HubSpot app settings
      // Just return the metadata to be stored in the database
      return new Ok({
        updatedRemoteMetadata: {
          ...remoteMetadata,
        },
      });
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to create HubSpot webhooks")
      );
    }
  }

  async deleteWebhooks({
    auth,
    connectionId,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, any>;
  }): Promise<Result<void, Error>> {
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        return new Err(new Error("HubSpot connection not found"));
      }

      const workspace = auth.workspace();
      if (!workspace) {
        return new Err(new Error("Workspace not found"));
      }

      const workspaceId = metadataRes.value.connection.metadata.workspace_id;
      if (!workspaceId || workspaceId !== workspace.sId) {
        return new Err(
          new Error("Connection does not belong to this workspace")
        );
      }

      // No server-side API calls needed - webhooks are configured manually in HubSpot app settings
      // Just verify the connection and return success
      return new Ok(undefined);
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to delete webhook from HubSpot")
      );
    }
  }
}
