import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { FathomAdditionalData } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_service_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

const FATHOM_API_BASE_URL = "https://api.fathom.ai/external/v1";

export class FathomWebhookService implements RemoteWebhookService {
  async getServiceData(
    oauthToken: string
  ): Promise<Result<FathomAdditionalData, Error>> {
    // Return default webhook options - all enabled by default
    return new Ok({
      webhookOptions: {
        include_transcript: true,
        include_summary: true,
        include_action_items: true,
        include_crm_matches: true,
      },
    });
  }

  async createWebhooks({
    auth,
    connectionId,
    remoteMetadata,
    webhookUrl,
    secret,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: FathomAdditionalData;
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
        return new Err(new Error("Fathom connection not found"));
      }

      const workspace = auth.getNonNullableWorkspace();

      const workspaceId = metadataRes.value.connection.metadata.workspace_id;
      if (!workspaceId || workspaceId !== workspace.sId) {
        return new Err(
          new Error("Connection does not belong to this workspace")
        );
      }

      const tokenRes = await oauthAPI.getAccessToken({ connectionId });

      if (tokenRes.isErr()) {
        return new Err(new Error("Failed to get Fathom access token"));
      }

      const accessToken = tokenRes.value.access_token;

      // Extract webhook options from remoteMetadata
      const webhookOptions = remoteMetadata.webhookOptions || {
        include_transcript: true,
        include_summary: true,
        include_action_items: true,
        include_crm_matches: true,
      };

      // Validate that at least one option is enabled
      const hasAtLeastOneOption =
        webhookOptions.include_transcript ||
        webhookOptions.include_summary ||
        webhookOptions.include_action_items ||
        webhookOptions.include_crm_matches;

      if (!hasAtLeastOneOption) {
        return new Err(
          new Error(
            "At least one webhook option must be enabled (transcript, summary, action items, or CRM matches)"
          )
        );
      }

      // Create webhook via Fathom API
      const response = await fetch(`${FATHOM_API_BASE_URL}/webhooks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination_url: webhookUrl,
          triggered_for: ["shared_team_recordings"],
          include_transcript: webhookOptions.include_transcript,
          include_summary: webhookOptions.include_summary,
          include_action_items: webhookOptions.include_action_items,
          include_crm_matches: webhookOptions.include_crm_matches,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Err(
          new Error(
            `Failed to create Fathom webhook: ${response.status} ${errorText}`
          )
        );
      }

      const webhookData = await response.json();

      return new Ok({
        updatedRemoteMetadata: {
          ...remoteMetadata,
          webhookId: webhookData.id,
          webhookSecret: webhookData.secret,
        },
      });
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to create Fathom webhook")
      );
    }
  }

  async deleteWebhooks({
    auth,
    connectionId,
    remoteMetadata,
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
        return new Err(new Error("Fathom connection not found"));
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

      const tokenRes = await oauthAPI.getAccessToken({
        connectionId,
      });

      if (tokenRes.isErr()) {
        return new Err(new Error("Failed to get Fathom access token"));
      }

      const accessToken = tokenRes.value.access_token;

      const webhookId = remoteMetadata.webhookId;
      if (!webhookId || typeof webhookId !== "string") {
        return new Err(new Error("Remote metadata missing webhookId"));
      }

      // Delete webhook via Fathom API
      const response = await fetch(
        `${FATHOM_API_BASE_URL}/webhooks/${webhookId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        logger.warn(
          `Failed to delete Fathom webhook: ${response.status} ${errorText}`
        );
        // Don't fail the entire operation if webhook deletion fails
      }

      return new Ok(undefined);
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to delete webhook from Fathom")
      );
    }
  }
}
