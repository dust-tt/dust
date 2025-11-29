import { z } from "zod";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

const AsanaWorkspaceResponseSchema = z.object({
  gid: z.string(),
  name: z.string(),
});

const AsanaProjectResponseSchema = z.object({
  gid: z.string(),
  name: z.string(),
});

const AsanaWebhookResponseSchema = z.object({
  gid: z.string(),
  active: z.boolean(),
  resource: z.object({
    gid: z.string(),
    name: z.string().optional(),
  }),
  target: z.string(),
});

const AsanaApiResponseSchema = z.object({
  data: z.any(),
  errors: z
    .array(
      z.object({
        message: z.string(),
      })
    )
    .optional(),
});

export type AsanaWorkspaceType = z.infer<typeof AsanaWorkspaceResponseSchema>;
export type AsanaProjectType = z.infer<typeof AsanaProjectResponseSchema>;
export type AsanaWebhookType = z.infer<typeof AsanaWebhookResponseSchema>;

export class AsanaClient {
  private readonly apiUrl = "https://app.asana.com/api/1.0";

  constructor(private readonly accessToken: string) {}

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<T, Error>> {
    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Err(
          new Error(
            `Asana API request failed: ${response.statusText} - ${errorText}`
          )
        );
      }

      // DELETE requests may return 204 No Content
      if (response.status === 204) {
        return new Ok(undefined as T);
      }

      const json = await response.json();
      const result = AsanaApiResponseSchema.parse(json);

      if (result.errors && result.errors.length > 0) {
        return new Err(
          new Error(result.errors.map((e) => e.message).join(", "))
        );
      }

      return new Ok(result.data as T);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(error.message));
    }
  }

  async getWorkspaces(): Promise<Result<AsanaWorkspaceType[], Error>> {
    const result = await this.request<AsanaWorkspaceType[]>(
      "GET",
      "/workspaces"
    );

    if (result.isErr()) {
      return result;
    }

    try {
      const workspaces = result.value.map((workspace: unknown) =>
        AsanaWorkspaceResponseSchema.parse(workspace)
      );
      return new Ok(workspaces);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(`Failed to parse workspaces: ${error.message}`));
    }
  }

  async getProjects(
    workspaceGid: string
  ): Promise<Result<AsanaProjectType[], Error>> {
    const result = await this.request<AsanaProjectType[]>(
      "GET",
      `/workspaces/${workspaceGid}/projects`
    );

    if (result.isErr()) {
      return result;
    }

    try {
      const projects = result.value.map((project: unknown) =>
        AsanaProjectResponseSchema.parse(project)
      );
      return new Ok(projects);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(`Failed to parse projects: ${error.message}`));
    }
  }

  async createWebhook({
    resourceGid,
    targetUrl,
  }: {
    resourceGid: string;
    targetUrl: string;
  }): Promise<Result<AsanaWebhookType, Error>> {
    const result = await this.request<AsanaWebhookType>("POST", "/webhooks", {
      data: {
        resource: resourceGid,
        target: targetUrl,
        filters: [
          { resource_type: "task", action: "added" },
          { resource_type: "task", action: "changed" },
          { resource_type: "task", action: "deleted" },
          { resource_type: "task", action: "removed" },
          { resource_type: "task", action: "undeleted" },
        ],
      },
    });

    if (result.isErr()) {
      return result;
    }

    try {
      const webhook = AsanaWebhookResponseSchema.parse(result.value);
      return new Ok(webhook);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(`Failed to parse webhook: ${error.message}`));
    }
  }

  async deleteWebhook(webhookGid: string): Promise<Result<void, Error>> {
    const result = await this.request<void>(
      "DELETE",
      `/webhooks/${webhookGid}`
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok(undefined);
  }
}
