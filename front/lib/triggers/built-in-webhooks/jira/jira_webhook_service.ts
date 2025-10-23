import {
  getJiraBaseUrl,
  getJiraResourceInfo,
  getProjects,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/jira_service_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class JiraWebhookService implements RemoteWebhookService {
  async getServiceData(
    oauthToken: string
  ): Promise<Result<JiraAdditionalData, Error>> {
    try {
      // Use existing Jira API helper

      // Get cloud ID and base URL
      const resourceInfo = await getJiraResourceInfo(oauthToken);
      if (!resourceInfo || resourceInfo.length === 0) {
        return new Err(new Error("No accessible Jira resources found"));
      }

      const { id: cloudId, url: siteUrl } = resourceInfo[0];
      const baseUrl = await getJiraBaseUrl(oauthToken);

      // Get projects
      const projectsResult = await getProjects(baseUrl, oauthToken);
      if (projectsResult.isErr()) {
        return new Err(projectsResult.error);
      }

      const projects = projectsResult.value.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
      }));

      return new Ok({ projects, cloudId, siteUrl });
    } catch (error) {
      logger.error({ error }, "Failed to fetch Jira service data");
      return new Err(
        error instanceof Error ? error : new Error("Unknown error")
      );
    }
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
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

      // Verify the connection belongs to this workspace
      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        return new Err(new Error("Jira connection not found"));
      }

      const workspace = auth.getNonNullableWorkspace();
      if (metadataRes.value.metadata.workspace_id !== workspace.sId) {
        return new Err(
          new Error("Connection does not belong to this workspace")
        );
      }

      // Get access token
      const tokenRes = await oauthAPI.getAccessToken({ connectionId });
      if (tokenRes.isErr()) {
        return new Err(new Error("Failed to get Jira access token"));
      }

      const accessToken = tokenRes.value.access_token;

      // Get base URL
      const baseUrl = await getJiraBaseUrl(accessToken);

      const projects =
        (remoteMetadata.projects as Array<{ key: string }>) || [];
      const webhookIds: Record<string, string> = {};
      const errors: string[] = [];

      // Create webhooks for each selected project
      for (const project of projects) {
        try {
          // Jira Webhooks API: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/#api-rest-api-3-webhook-post
          const response = await fetch(`${baseUrl}/rest/api/3/webhook`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              name: `Dust Webhook - ${project.key}`,
              url: webhookUrl,
              events,
              filters: {
                "issue-related-events-section": `project = ${project.key}`,
              },
              // Jira will generate a secret if we don't provide one
              ...(secret ? { secret } : {}),
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Failed to create webhook for project ${project.key}: ${errorText}`
            );
          }

          const data = await response.json();
          webhookIds[project.key] = data.id.toString();
        } catch (error: any) {
          errors.push(
            `Failed to create webhook for project ${project.key}: ${error.message}`
          );
          logger.error(
            { error, projectKey: project.key },
            "Failed to create Jira webhook"
          );
        }
      }

      if (Object.keys(webhookIds).length === 0) {
        return new Err(
          new Error("Failed to create any webhooks: " + errors.join(", "))
        );
      }

      return new Ok({
        updatedRemoteMetadata: {
          ...remoteMetadata,
          webhookIds,
        },
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      logger.error({ error }, "Failed to create Jira webhooks");
      return new Err(
        error instanceof Error ? error : new Error("Unknown error")
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
    remoteMetadata: Record<string, unknown>;
  }): Promise<Result<void, Error>> {
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

      // Get access token
      const tokenRes = await oauthAPI.getAccessToken({ connectionId });
      if (tokenRes.isErr()) {
        logger.warn("Failed to get Jira access token for webhook deletion");
        return new Ok(undefined);
      }

      const accessToken = tokenRes.value.access_token;

      // Get base URL
      const baseUrl = await getJiraBaseUrl(accessToken);

      const webhookIds = remoteMetadata.webhookIds as Record<string, string>;
      if (!webhookIds) {
        logger.warn("No webhook IDs found in metadata");
        return new Ok(undefined);
      }

      const errors: string[] = [];

      // Delete each webhook
      for (const [projectKey, webhookId] of Object.entries(webhookIds)) {
        try {
          const response = await fetch(
            `${baseUrl}/rest/api/3/webhook/${webhookId}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
              },
            }
          );

          if (!response.ok && response.status !== 404) {
            throw new Error(`Failed to delete webhook: ${response.statusText}`);
          }
        } catch (error: any) {
          errors.push(
            `Failed to delete webhook for ${projectKey}: ${error.message}`
          );
          logger.warn(
            { error, projectKey, webhookId },
            "Failed to delete Jira webhook"
          );
        }
      }

      if (errors.length > 0) {
        logger.warn({ errors }, "Some Jira webhooks failed to delete");
      }

      return new Ok(undefined);
    } catch (error) {
      logger.error({ error }, "Failed to delete Jira webhooks");
      // Don't fail the deletion if remote cleanup fails
      return new Ok(undefined);
    }
  }
}
