import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type {
  JiraProject,
  JiraResource,
} from "@app/lib/triggers/built-in-webhooks/jira/jira_api_schemas";
import {
  JiraCreateWebhookResponseSchema,
  JiraProjectsResponseSchema,
  JiraResourceSchema,
} from "@app/lib/triggers/built-in-webhooks/jira/jira_api_schemas";
import { validateJiraApiResponse } from "@app/lib/triggers/built-in-webhooks/jira/jira_api_validation";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/jira_service_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isString, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

export class JiraWebhookService implements RemoteWebhookService<"jira"> {
  async getServiceData(
    oauthToken: string
  ): Promise<Result<JiraAdditionalData, Error>> {
    const resourcesRes = await this.getAccessibleResources(oauthToken);
    if (resourcesRes.isErr()) {
      return resourcesRes;
    }

    const resources = resourcesRes.value;
    if (resources.length === 0) {
      return new Err(new Error("No accessible Jira resources found"));
    }

    const cloudId = resources[0].id;

    const projectsRes = await this.getProjects(oauthToken, cloudId);
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

    const resourcesRes = await this.getAccessibleResources(accessToken);
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

      const createRes = await this.createWebhook({
        accessToken,
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

      const deleteRes = await this.deleteWebhook({
        accessToken,
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

  private async getAccessibleResources(
    accessToken: string
  ): Promise<Result<JiraResource[], Error>> {
    const response = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    const validationResult = await validateJiraApiResponse(
      response,
      JiraResourceSchema.array()
    );

    if (validationResult.isErr()) {
      return new Err(
        new Error(
          `Failed to fetch accessible resources: ${validationResult.error.message}`
        )
      );
    }

    return new Ok(validationResult.value);
  }

  private async getProjects(
    accessToken: string,
    cloudId: string
  ): Promise<Result<JiraProject[], Error>> {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    const validationResult = await validateJiraApiResponse(
      response,
      JiraProjectsResponseSchema
    );

    if (validationResult.isErr()) {
      return new Err(
        new Error(`Failed to fetch projects: ${validationResult.error.message}`)
      );
    }

    return new Ok(validationResult.value.values || []);
  }

  private async createWebhook({
    accessToken,
    cloudId,
    webhookUrl,
    events,
    projectKey,
  }: {
    accessToken: string;
    cloudId: string;
    webhookUrl: string;
    events: string[];
    projectKey: string;
  }): Promise<Result<{ id: string }, Error>> {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: webhookUrl,
          webhooks: [
            {
              events,
              jqlFilter: `project = "${projectKey.replace(/"/g, '\\"')}"`,
            },
          ],
        }),
      }
    );

    const validationResult = await validateJiraApiResponse(
      response,
      JiraCreateWebhookResponseSchema
    );

    if (validationResult.isErr()) {
      return new Err(
        new Error(`Failed to create webhook: ${validationResult.error.message}`)
      );
    }

    const data = validationResult.value;
    const result = data.webhookRegistrationResult?.[0];
    if (!result?.createdWebhookId) {
      const errors = result?.errors?.join(", ") ?? "Unknown error";
      return new Err(new Error(`Failed to create webhook: ${errors}`));
    }

    return new Ok({ id: String(result.createdWebhookId) });
  }

  private async deleteWebhook({
    accessToken,
    cloudId,
    webhookId,
  }: {
    accessToken: string;
    cloudId: string;
    webhookId: string;
  }): Promise<Result<void, Error>> {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhookIds: [parseInt(webhookId, 10)],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Failed to delete webhook: ${response.statusText} - ${errorText}`
        )
      );
    }

    return new Ok(undefined);
  }
}
