import type { z } from "zod";

import type {
  JiraProjectType,
  JiraResourceType,
  JiraWebhookType,
} from "@app/lib/api/jira/types";
import {
  JiraCreateWebhookResponseSchema,
  JiraProjectsResponseSchema,
  JiraResourceSchema,
  JiraWebhooksResponseSchema,
} from "@app/lib/api/jira/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

type JiraErrorResult = string;

async function validateJiraApiResponse<T extends z.ZodTypeAny>(
  response: Response,
  schema: T
): Promise<Result<z.infer<T>, Error>> {
  if (!response.ok) {
    const errorText = await response.text();
    return new Err(
      new Error(`API request failed: ${response.statusText} - ${errorText}`)
    );
  }

  const rawData = await response.json();
  const parseResult = schema.safeParse(rawData);
  if (!parseResult.success) {
    return new Err(
      new Error(
        `API response validation failed: ${parseResult.error.message}. Response: ${JSON.stringify(rawData)}`
      )
    );
  }

  return new Ok(parseResult.data);
}

export class JiraClient {
  private readonly accessToken: string;
  private resourceInfoCache: {
    id: string;
    url: string;
    name: string;
  } | null = null;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getAccessibleResources(): Promise<Result<JiraResourceType[], Error>> {
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

    return validateJiraApiResponse(response, JiraResourceSchema.array());
  }

  private async getJiraResourceInfo(): Promise<{
    id: string;
    url: string;
    name: string;
  } | null> {
    if (this.resourceInfoCache) {
      return this.resourceInfoCache;
    }

    const result = await this.getAccessibleResources();
    if (result.isErr()) {
      return null;
    }

    const resources = result.value;
    if (resources && resources.length > 0) {
      const resource = resources[0];
      this.resourceInfoCache = {
        id: resource.id,
        url: resource.url,
        name: resource.name,
      };
      return this.resourceInfoCache;
    }

    return null;
  }

  async getJiraBaseUrl(): Promise<string | null> {
    const resourceInfo = await this.getJiraResourceInfo();
    const cloudId = resourceInfo?.id ?? null;
    if (cloudId) {
      return `https://api.atlassian.com/ex/jira/${cloudId}`;
    }
    return null;
  }

  async getProjects(
    cloudId: string
  ): Promise<Result<JiraProjectType[], Error>> {
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
      return new Err(new Error(validationResult.error.message));
    }

    const data = validationResult.value;
    const result = data.webhookRegistrationResult?.[0];
    if (!result?.createdWebhookId) {
      const errors = result?.errors?.join(", ") ?? "Unknown error";
      return new Err(new Error(errors));
    }

    return new Ok({ id: String(result.createdWebhookId) });
  }

  async getWebhooks(
    cloudId: string
  ): Promise<Result<JiraWebhookType[], Error>> {
    const allWebhooks: JiraWebhookType[] = [];
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    do {
      const url = new URL(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`
      );
      url.searchParams.append("startAt", String(startAt));
      url.searchParams.append("maxResults", String(maxResults));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
      });

      const validationResult = await validateJiraApiResponse(
        response,
        JiraWebhooksResponseSchema
      );

      if (validationResult.isErr()) {
        return new Err(
          new Error(
            `Failed to fetch webhooks: ${validationResult.error.message}`
          )
        );
      }

      const data = validationResult.value;
      allWebhooks.push(...data.values);
      isLast = data.isLast;
      startAt += data.values.length;
    } while (!isLast);

    return new Ok(allWebhooks);
  }

  async deleteWebhooks({
    cloudId,
    webhookIds,
  }: {
    cloudId: string;
    webhookIds: number[];
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
          webhookIds,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Failed to delete webhooks: ${response.statusText} - ${errorText}`
        )
      );
    }

    return new Ok(undefined);
  }

  async call<T extends z.ZodTypeAny>(
    endpoint: string,
    schema: T,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      baseUrl?: string;
    } = {}
  ): Promise<Result<z.infer<T>, JiraErrorResult>> {
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      baseUrl = (await this.getJiraBaseUrl()) ?? undefined;
    }
    if (!baseUrl) {
      return new Err("Failed to retrieve JIRA base URL");
    }

    try {
      const fetchOptions: RequestInit = {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(`${baseUrl}${endpoint}`, fetchOptions);

      if (!response.ok) {
        const errorBody = await response.text();
        const msg = `JIRA API error: ${response.status} ${response.statusText} - ${errorBody}`;
        logger.error(`[JIRA Client] ${msg}`);
        return new Err(msg);
      }

      const rawData = await response.json();
      const parseResult = schema.safeParse(rawData);

      if (!parseResult.success) {
        const msg = `Invalid JIRA response format: ${parseResult.error.message}`;
        logger.error(`[JIRA Client] ${msg}`);
        return new Err(msg);
      }

      return new Ok(parseResult.data);
    } catch (error: unknown) {
      logger.error(`[JIRA Client] JIRA API call failed for ${endpoint}:`);
      return new Err(normalizeError(error).message);
    }
  }

  getAccessToken(): string {
    return this.accessToken;
  }
}
