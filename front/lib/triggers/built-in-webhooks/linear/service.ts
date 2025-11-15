import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { LinearClient } from "@app/lib/triggers/built-in-webhooks/linear/linear_client";
import type { LinearAdditionalData } from "@app/lib/triggers/built-in-webhooks/linear/types";
import {
  isLinearWebhookCreateMetadata,
  isLinearWebhookMetadata,
} from "@app/lib/triggers/built-in-webhooks/linear/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class LinearWebhookService implements RemoteWebhookService<"linear"> {
  private async getLinearClient(
    auth: Authenticator,
    {
      connectionId,
    }: {
      connectionId: string;
    }
  ): Promise<Result<LinearClient, Error>> {
    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId,
    });
    if (metadataRes.isErr()) {
      return new Err(new Error("Linear connection not found"));
    }

    const { workspace_id: workspaceId } = metadataRes.value.connection.metadata;
    if (!workspaceId || workspaceId !== auth.getNonNullableWorkspace().sId) {
      return new Err(new Error("Connection does not belong to this workspace"));
    }

    const tokenRes = await oauthAPI.getAccessToken({ connectionId });
    if (tokenRes.isErr()) {
      return new Err(new Error("Failed to get Linear access token"));
    }

    const { access_token: accessToken } = tokenRes.value;
    return new Ok(new LinearClient(accessToken));
  }

  async getServiceData(
    oauthToken: string
  ): Promise<Result<LinearAdditionalData, Error>> {
    const client = new LinearClient(oauthToken);
    const teamsRes = await client.getTeams();

    if (teamsRes.isErr()) {
      return teamsRes;
    }

    return new Ok({ teams: teamsRes.value });
  }

  async createWebhooks({
    auth,
    connectionId,
    remoteMetadata,
    webhookUrl,
    events,
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
    const clientResult = await this.getLinearClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    if (!isLinearWebhookCreateMetadata(remoteMetadata)) {
      return new Err(
        new Error(
          "Invalid remote metadata: missing or invalid Linear webhook configuration"
        )
      );
    }

    const teams = remoteMetadata.teams;

    if (teams.length === 0) {
      return new Err(new Error("At least one team must be specified"));
    }

    const webhookIds: Record<string, string> = {};
    const errors: string[] = [];

    // Create webhooks for individual teams.
    for (const team of teams) {
      const createRes = await client.createWebhook({
        url: webhookUrl,
        resourceTypes: events,
        teamId: team.id,
      });

      if (createRes.isErr()) {
        errors.push(`Team "${team.name}": ${createRes.error.message}`);
        continue;
      }

      webhookIds[team.id] = createRes.value.id;
    }

    if (Object.keys(webhookIds).length === 0) {
      return new Err(new Error(errors.join("; ")));
    }

    return new Ok({
      updatedRemoteMetadata: {
        ...remoteMetadata,
        webhookIds,
      },
      errors: errors.length > 0 ? errors : undefined,
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
    const clientResult = await this.getLinearClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    if (!isLinearWebhookMetadata(remoteMetadata)) {
      return new Err(
        new Error(
          "Invalid remote metadata: missing or invalid Linear webhook metadata"
        )
      );
    }

    const { webhookIds } = remoteMetadata;

    if (Object.keys(webhookIds).length === 0) {
      return new Err(new Error("No webhooks to delete in remote metadata"));
    }

    const errors: string[] = [];

    for (const [teamKey, webhookId] of Object.entries(webhookIds)) {
      if (typeof webhookId !== "string") {
        errors.push(`Team "${teamKey}": Invalid webhook ID`);
        continue;
      }

      const deleteRes = await client.deleteWebhook(webhookId);

      if (deleteRes.isErr()) {
        errors.push(`Team "${teamKey}": ${deleteRes.error.message}`);
      }
    }

    if (errors.length > 0) {
      logger.warn({ errors }, "Some Linear webhooks failed to delete");
    }

    return new Ok(undefined);
  }
}
