import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { FathomClient } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_client";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isString, OAuthAPI, Ok } from "@app/types";
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

  async getServiceData(
    oauthToken: string
  ): Promise<Result<Record<string, never>, Error>> {
    return new Ok({});
  }

  async createWebhooks({
    auth,
    connectionId,
    remoteMetadata,
    webhookUrl,
    events,
    secret,
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

    const triggeredFor = (remoteMetadata.triggered_for as string[]) || [
      "my_recordings",
      "shared_external_recordings",
    ];

    const includeTranscript =
      (remoteMetadata.include_transcript as boolean) ?? true;
    const includeSummary = (remoteMetadata.include_summary as boolean) ?? true;
    const includeActionItems =
      (remoteMetadata.include_action_items as boolean) ?? true;
    const includeCrmMatches =
      (remoteMetadata.include_crm_matches as boolean) ?? false;

    const createRes = await client.createWebhook({
      destinationUrl: webhookUrl,
      triggeredFor: triggeredFor as any[],
      includeTranscript: includeTranscript,
      includeSummary: includeSummary,
      includeActionItems: includeActionItems,
      includeCrmMatches: includeCrmMatches,
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

    const { webhookId } = remoteMetadata;

    if (!isString(webhookId)) {
      return new Err(new Error("Remote metadata missing webhookId"));
    }

    const deleteRes = await client.deleteWebhook(webhookId);

    if (deleteRes.isErr()) {
      logger.warn(
        { error: deleteRes.error, webhookId },
        "Failed to delete Fathom webhook"
      );
      return deleteRes;
    }

    return new Ok(undefined);
  }
}
