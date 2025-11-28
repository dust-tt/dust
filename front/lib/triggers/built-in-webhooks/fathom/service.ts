import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { FathomClient } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_client";
import {
  isFathomWebhookCreateMetadata,
  isFathomWebhookMetadata,
} from "@app/lib/triggers/built-in-webhooks/fathom/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class FathomWebhookService implements RemoteWebhookService<"fathom"> {
  private async getFathomClient(
    auth: Authenticator,
    {
      connectionId,
    }: {
      connectionId: string;
    }
  ): Promise<Result<FathomClient, Error>> {
    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId,
    });
    if (metadataRes.isErr()) {
      return new Err(new Error("Fathom connection not found"));
    }

    const { workspace_id: workspaceId } = metadataRes.value.connection.metadata;
    if (!workspaceId || workspaceId !== auth.getNonNullableWorkspace().sId) {
      return new Err(new Error("Connection does not belong to this workspace"));
    }

    const tokenRes = await oauthAPI.getAccessToken({ connectionId });
    if (tokenRes.isErr()) {
      return new Err(new Error("Failed to get Fathom access token"));
    }

    const { access_token: accessToken } = tokenRes.value;
    return new Ok(new FathomClient(accessToken));
  }

  async getServiceData(): Promise<Result<Record<string, never>, Error>> {
    return new Ok({});
  }

  async createWebhooks({
    auth,
    connectionId,
    remoteMetadata,
    webhookUrl,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, unknown>;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: Record<string, unknown>;
        errors?: string[];
      },
      Error
    >
  > {
    const clientResult = await this.getFathomClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    if (!isFathomWebhookCreateMetadata(remoteMetadata)) {
      return new Err(
        new Error(
          "Invalid remote metadata: missing or invalid Fathom webhook configuration"
        )
      );
    }

    const createRes = await client.createWebhook({
      destinationUrl: webhookUrl,
      triggeredFor: remoteMetadata.triggered_for,
      includeTranscript: remoteMetadata.include_transcript,
      includeSummary: remoteMetadata.include_summary,
      includeActionItems: remoteMetadata.include_action_items,
      includeCrmMatches: remoteMetadata.include_crm_matches,
    });

    if (createRes.isErr()) {
      logger.error(
        { error: createRes.error },
        "Failed to create Fathom webhook"
      );
      return new Err(
        new Error(`Failed to create Fathom webhook: ${createRes.error.message}`)
      );
    }

    const webhook = createRes.value;

    return new Ok({
      updatedRemoteMetadata: {
        ...remoteMetadata,
        webhookId: webhook.id,
        triggered_for: webhook.triggeredFor,
        include_transcript: webhook.includeTranscript,
        include_summary: webhook.includeSummary,
        include_action_items: webhook.includeActionItems,
        include_crm_matches: webhook.includeCrmMatches,
      },
      secret: webhook.secret,
    });
  }

  async deleteWebhooks({
    auth,
    connectionId,
    remoteMetadata,
  }: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, unknown>;
  }): Promise<Result<void, Error>> {
    const clientResult = await this.getFathomClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    if (!isFathomWebhookMetadata(remoteMetadata)) {
      return new Err(
        new Error(
          "Invalid remote metadata: missing or invalid Fathom webhook metadata"
        )
      );
    }

    const deleteRes = await client.deleteWebhook(remoteMetadata.webhookId);

    if (deleteRes.isErr()) {
      logger.warn(
        { error: deleteRes.error, webhookId: remoteMetadata.webhookId },
        "Failed to delete Fathom webhook"
      );
      return deleteRes;
    }

    return new Ok(undefined);
  }
}
