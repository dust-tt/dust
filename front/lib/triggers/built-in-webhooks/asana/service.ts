import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { AsanaClient } from "@app/lib/triggers/built-in-webhooks/asana/asana_client";
import type { AsanaAdditionalData } from "@app/lib/triggers/built-in-webhooks/asana/types";
import {
  isAsanaWebhookCreateMetadata,
  isAsanaWebhookMetadata,
} from "@app/lib/triggers/built-in-webhooks/asana/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class AsanaWebhookService implements RemoteWebhookService<"asana"> {
  private async getAsanaClient(
    auth: Authenticator,
    {
      connectionId,
    }: {
      connectionId: string;
    }
  ): Promise<Result<AsanaClient, Error>> {
    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId,
    });
    if (metadataRes.isErr()) {
      return new Err(new Error("Asana connection not found"));
    }

    const { workspace_id: workspaceId } = metadataRes.value.connection.metadata;
    if (!workspaceId || workspaceId !== auth.getNonNullableWorkspace().sId) {
      return new Err(new Error("Connection does not belong to this workspace"));
    }

    const tokenRes = await oauthAPI.getAccessToken({ connectionId });
    if (tokenRes.isErr()) {
      return new Err(new Error("Failed to get Asana access token"));
    }

    const { access_token: accessToken } = tokenRes.value;
    return new Ok(new AsanaClient(accessToken));
  }

  async getServiceData(
    oauthToken: string
  ): Promise<Result<AsanaAdditionalData, Error>> {
    const client = new AsanaClient(oauthToken);
    const workspacesRes = await client.getWorkspaces();

    if (workspacesRes.isErr()) {
      return workspacesRes;
    }

    const workspaces = workspacesRes.value.map((w) => ({
      gid: w.gid,
      name: w.name,
    }));

    // Fetch projects for each workspace
    const projectsByWorkspace: Record<
      string,
      Array<{ gid: string; name: string }>
    > = {};

    for (const workspace of workspaces) {
      const projectsRes = await client.getProjects(workspace.gid);
      if (projectsRes.isOk()) {
        projectsByWorkspace[workspace.gid] = projectsRes.value.map((p) => ({
          gid: p.gid,
          name: p.name,
        }));
      } else {
        // If we fail to get projects for a workspace, log but continue
        logger.warn(
          { workspaceGid: workspace.gid, error: projectsRes.error.message },
          "Failed to fetch projects for Asana workspace"
        );
        projectsByWorkspace[workspace.gid] = [];
      }
    }

    return new Ok({
      workspaces,
      projectsByWorkspace,
    });
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
    const clientResult = await this.getAsanaClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    if (!isAsanaWebhookCreateMetadata(remoteMetadata)) {
      return new Err(
        new Error(
          "Invalid remote metadata: missing or invalid Asana webhook configuration"
        )
      );
    }

    const { project } = remoteMetadata;

    const createRes = await client.createWebhook({
      resourceGid: project.gid,
      targetUrl: webhookUrl,
    });

    if (createRes.isErr()) {
      return new Err(
        new Error(`Failed to create webhook: ${createRes.error.message}`)
      );
    }

    return new Ok({
      updatedRemoteMetadata: {
        ...remoteMetadata,
        webhookId: createRes.value.gid,
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
    const clientResult = await this.getAsanaClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    if (!isAsanaWebhookMetadata(remoteMetadata)) {
      return new Err(
        new Error(
          "Invalid remote metadata: missing or invalid Asana webhook metadata"
        )
      );
    }

    const { webhookId } = remoteMetadata;

    const deleteRes = await client.deleteWebhook(webhookId);

    if (deleteRes.isErr()) {
      logger.warn(
        { error: deleteRes.error.message },
        "Failed to delete Asana webhook"
      );
    }

    return new Ok(undefined);
  }
}
