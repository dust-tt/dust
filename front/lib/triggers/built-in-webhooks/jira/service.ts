import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { JiraClient } from "@app/lib/triggers/built-in-webhooks/jira/jira_client";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isString, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class JiraWebhookService implements RemoteWebhookService<"jira"> {
  private async getJiraClient(
    auth: Authenticator,
    {
      connectionId,
    }: {
      connectionId: string;
    }
  ): Promise<Result<JiraClient, Error>> {
    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId,
    });
    if (metadataRes.isErr()) {
      return new Err(new Error("Jira connection not found"));
    }

    const { workspace_id: workspaceId } = metadataRes.value.connection.metadata;
    if (!workspaceId || workspaceId !== auth.getNonNullableWorkspace().sId) {
      return new Err(new Error("Connection does not belong to this workspace"));
    }

    const tokenRes = await oauthAPI.getAccessToken({ connectionId });
    if (tokenRes.isErr()) {
      return new Err(new Error("Failed to get Jira access token"));
    }

    const { access_token: accessToken } = tokenRes.value;
    return new Ok(new JiraClient(accessToken));
  }

  async getServiceData(
    oauthToken: string
  ): Promise<Result<JiraAdditionalData, Error>> {
    const client = new JiraClient(oauthToken);

    const resourcesRes = await client.getAccessibleResources();
    if (resourcesRes.isErr()) {
      return resourcesRes;
    }

    const resources = resourcesRes.value;
    if (resources.length === 0) {
      return new Err(new Error("No accessible Jira resources found"));
    }

    const cloudId = resources[0].id;

    const projectsRes = await client.getProjects(cloudId);
    if (projectsRes.isErr()) {
      return projectsRes;
    }

    return new Ok({ projects: projectsRes.value });
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
    const clientResult = await this.getJiraClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    const resourcesRes = await client.getAccessibleResources();
    if (resourcesRes.isErr()) {
      return resourcesRes;
    }

    const resources = resourcesRes.value;
    if (resources.length === 0) {
      return new Err(new Error("No accessible Jira resources found"));
    }

    const projects = Array.isArray(remoteMetadata.projects)
      ? remoteMetadata.projects
      : [];

    if (projects.length === 0) {
      return new Err(
        new Error("At least one project must be specified in remoteMetadata")
      );
    }

    const cloudId = resources[0].id;
    const webhookIds: Record<string, string> = {};
    const errors: string[] = [];

    for (const project of projects) {
      const projectKey = project.key;
      if (!projectKey) {
        errors.push(`Invalid project: missing key`);
        continue;
      }

      const createRes = await client.createWebhook({
        cloudId,
        webhookUrl,
        events,
        projectKey,
      });

      if (createRes.isErr()) {
        errors.push(
          `Failed to register webhook for project ${projectKey}: ${createRes.error.message}`
        );
        continue;
      }

      webhookIds[projectKey] = createRes.value.id;
    }

    if (Object.keys(webhookIds).length === 0) {
      return new Err(new Error(errors.join(", ")));
    }

    return new Ok({
      updatedRemoteMetadata: {
        ...remoteMetadata,
        webhookIds,
        cloudId,
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
    const clientResult = await this.getJiraClient(auth, { connectionId });
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    const { cloudId, webhookIds } = remoteMetadata;

    if (!isString(cloudId)) {
      return new Err(new Error("Remote metadata missing cloudId"));
    }

    if (!webhookIds || typeof webhookIds !== "object") {
      return new Err(new Error("Remote metadata missing webhookIds"));
    }

    if (Object.keys(webhookIds).length === 0) {
      return new Err(new Error("No webhooks to delete in remote metadata"));
    }

    const errors: string[] = [];

    for (const [projectKey, webhookId] of Object.entries(webhookIds)) {
      if (!isString(webhookId)) {
        errors.push(`Invalid webhook ID for project ${projectKey}`);
        continue;
      }

      const deleteRes = await client.deleteWebhooks({
        cloudId,
        webhookIds: [parseInt(webhookId, 10)],
      });

      if (deleteRes.isErr()) {
        errors.push(
          `Failed to delete webhook for project ${projectKey}: ${deleteRes.error.message}`
        );
      }
    }

    if (errors.length > 0) {
      logger.warn(`Some webhooks failed to delete: ${errors.join(", ")}`);
    }

    return new Ok(undefined);
  }
}
