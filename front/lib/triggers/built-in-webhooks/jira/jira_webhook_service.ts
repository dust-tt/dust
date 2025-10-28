import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { JiraClient } from "@app/lib/triggers/built-in-webhooks/jira/jira_client";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/jira_service_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isString, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class JiraWebhookService implements RemoteWebhookService<"jira"> {
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

    const projects = projectsRes.value.map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
    }));

    return new Ok({ projects });
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
    const client = new JiraClient(accessToken);

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
          `Failed to create webhook for project ${projectKey}: ${createRes.error.message}`
        );
        continue;
      }

      webhookIds[projectKey] = createRes.value.id;
    }

    if (Object.keys(webhookIds).length === 0) {
      return new Err(
        new Error(`Failed to create any webhooks. Errors: ${errors.join(", ")}`)
      );
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
    const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

    const metadataRes = await oauthAPI.getConnectionMetadata({
      connectionId,
    });
    if (metadataRes.isErr()) {
      return new Err(new Error("Jira connection not found"));
    }

    const workspaceId = metadataRes.value.connection.metadata.workspace_id;
    if (!workspaceId || workspaceId !== auth.getNonNullableWorkspace().sId) {
      return new Err(new Error("Connection does not belong to this workspace"));
    }

    const tokenRes = await oauthAPI.getAccessToken({
      connectionId,
    });
    if (tokenRes.isErr()) {
      return new Err(new Error("Failed to get Jira access token"));
    }

    const { access_token: accessToken } = tokenRes.value;
    const client = new JiraClient(accessToken);
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
      if (typeof webhookId !== "string") {
        errors.push(`Invalid webhook ID for project ${projectKey}`);
        continue;
      }

      const deleteRes = await client.deleteWebhook({
        cloudId,
        webhookId,
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
