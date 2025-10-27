import config from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/jira_service_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { isString } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";

interface JiraResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
  avatarUrl: string;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  self: string;
}

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

    const checkConnectionOwnershipResult = await checkConnectionOwnership(
      auth,
      connectionId
    );
    if (checkConnectionOwnershipResult.isErr()) {
      return checkConnectionOwnershipResult;
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

    const checkConnectionOwnershipResult = await checkConnectionOwnership(
      auth,
      connectionId
    );
    if (checkConnectionOwnershipResult.isErr()) {
      return checkConnectionOwnershipResult;
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

    if (!response.ok) {
      return new Err(
        new Error(
          `Failed to fetch accessible resources: ${response.statusText}`
        )
      );
    }

    // TODO(HOOTL): add validation here.
    const resources = (await response.json()) as JiraResource[];
    return new Ok(resources);
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

    if (!response.ok) {
      return new Err(
        new Error(`Failed to fetch projects: ${response.statusText}`)
      );
    }

    // TODO(HOOTL): add validation here.
    const data = (await response.json()) as { values: JiraProject[] };
    return new Ok(data.values || []);
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
              jqlFilter: `project = ${projectKey}`,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Failed to create webhook: ${response.statusText} - ${errorText}`
        )
      );
    }

    // TODO(HOOTL): add validation here.
    const data = (await response.json()) as {
      webhookRegistrationResult: {
        createdWebhookId?: number;
        errors?: string[];
      }[];
    };

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
