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
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// TODO(2025-10-28 aubin): consolidate with the MCP server.

export class JiraClient {
  constructor(private readonly accessToken: string) {}

  async getAccessibleResources(): Promise<Result<JiraResource[], Error>> {
    const response = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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

  async getProjects(cloudId: string): Promise<Result<JiraProject[], Error>> {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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

  async createWebhook({
    cloudId,
    webhookUrl,
    events,
    projectKey,
  }: {
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
          Authorization: `Bearer ${this.accessToken}`,
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

  async deleteWebhook({
    cloudId,
    webhookId,
  }: {
    cloudId: string;
    webhookId: string;
  }): Promise<Result<void, Error>> {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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
