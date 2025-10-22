import { Octokit } from "@octokit/core";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, isString, OAuthAPI, Ok } from "@app/types";

import type { RemoteWebhookService } from "./remote_webhook_service";

export class GitHubWebhookService implements RemoteWebhookService {
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
    remoteMetadata: Record<string, any>;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        updatedRemoteMetadata: Record<string, any>;
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
        return new Err(new Error("GitHub connection not found"));
      }

      const workspace = auth.getNonNullableWorkspace();

      const workspaceId = metadataRes.value.connection.metadata.workspace_id;
      if (!workspaceId || workspaceId !== workspace.sId) {
        return new Err(
          new Error("Connection does not belong to this workspace")
        );
      }

      const tokenRes = await oauthAPI.getAccessToken({ connectionId });

      if (tokenRes.isErr()) {
        return new Err(new Error("Failed to get GitHub access token"));
      }

      const accessToken = tokenRes.value.access_token;
      const octokit = new Octokit({ auth: accessToken });

      // Extract repositories and organizations from remoteMetadata
      const repositories = Array.isArray(remoteMetadata.repositories)
        ? remoteMetadata.repositories
        : [];
      const organizations = Array.isArray(remoteMetadata.organizations)
        ? remoteMetadata.organizations
        : [];

      if (repositories.length === 0 && organizations.length === 0) {
        return new Err(
          new Error(
            "At least one repository or organization must be specified in remoteMetadata"
          )
        );
      }

      const webhookIds: Record<string, string> = {};
      const errors: string[] = [];

      // Create webhooks for repositories
      for (const repository of repositories) {
        if (!isString(repository)) {
          errors.push(`Invalid repository format: ${repository}`);
          continue;
        }

        const [owner, repo] = repository.split("/");
        if (!owner || !repo) {
          errors.push(
            `Invalid repository format: ${repository}. Expected format: owner/repo`
          );
          continue;
        }

        try {
          // Check the OAuth token scopes and repository permissions
          const { headers: scopeHeaders } = await octokit.request("GET /user");
          const scopes = scopeHeaders["x-oauth-scopes"] ?? "";

          const { data: repoData } = await octokit.request(
            "GET /repos/{owner}/{repo}",
            {
              owner,
              repo,
            }
          );

          // Check if user has admin permissions
          if (!repoData.permissions?.admin) {
            errors.push(
              `You need admin permissions on ${repository} to create webhooks. Current permissions: ${JSON.stringify(repoData.permissions)}. Token scopes: ${scopes}`
            );
            continue;
          }

          const { data: webhook } = await octokit.request(
            "POST /repos/{owner}/{repo}/hooks",
            {
              owner,
              repo,
              name: "web",
              active: true,
              events,
              config: {
                url: webhookUrl,
                content_type: "json",
                secret: secret ?? undefined,
                insecure_ssl: "0",
              },
            }
          );

          webhookIds[repository] = String(webhook.id);
        } catch (error: any) {
          errors.push(
            `Failed to create webhook for ${repository}: ${error.message}`
          );
        }
      }

      // Create webhooks for organizations
      for (const organization of organizations) {
        if (!isString(organization)) {
          errors.push(`Invalid organization format: ${organization}`);
          continue;
        }

        try {
          const { data: webhook } = await octokit.request(
            "POST /orgs/{org}/hooks",
            {
              org: organization,
              name: "web",
              active: true,
              events,
              config: {
                url: webhookUrl,
                content_type: "json",
                secret: secret ?? undefined,
                insecure_ssl: "0",
              },
            }
          );

          webhookIds[organization] = String(webhook.id);
        } catch (error: any) {
          errors.push(
            `Failed to create webhook for organization ${organization}: ${error.message}`
          );
        }
      }

      // If no webhooks were created successfully, return an error
      if (Object.keys(webhookIds).length === 0) {
        return new Err(
          new Error(
            `Failed to create any webhooks. Errors: ${errors.join(", ")}`
          )
        );
      }

      return new Ok({
        updatedRemoteMetadata: {
          ...remoteMetadata,
          webhookIds,
        },
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to create GitHub webhooks")
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
    remoteMetadata: Record<string, any>;
  }): Promise<Result<void, Error>> {
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        return new Err(new Error("GitHub connection not found"));
      }

      const workspace = auth.workspace();
      if (!workspace) {
        return new Err(new Error("Workspace not found"));
      }

      const workspaceId = metadataRes.value.connection.metadata.workspace_id;
      if (!workspaceId || workspaceId !== workspace.sId) {
        return new Err(
          new Error("Connection does not belong to this workspace")
        );
      }

      const tokenRes = await oauthAPI.getAccessToken({
        connectionId,
      });

      if (tokenRes.isErr()) {
        return new Err(new Error("Failed to get GitHub access token"));
      }

      const accessToken = tokenRes.value.access_token;
      const octokit = new Octokit({ auth: accessToken });

      // Support both legacy format (single webhookId) and new format (webhookIds map)
      const legacyWebhookId = remoteMetadata.webhookId;
      const legacyRepository = remoteMetadata.repository;

      // Build webhookIds object, including legacy format if present
      let webhookIds = remoteMetadata.webhookIds || {};

      if (isString(legacyWebhookId) && isString(legacyRepository)) {
        webhookIds = {
          ...webhookIds,
          [legacyRepository]: legacyWebhookId,
        };
      }

      if (!webhookIds || typeof webhookIds !== "object") {
        return new Err(
          new Error("Remote metadata missing webhookIds or webhookId")
        );
      }

      if (Object.keys(webhookIds).length === 0) {
        return new Err(new Error("No webhooks to delete in remote metadata"));
      }

      const errors: string[] = [];

      // Delete all webhooks
      for (const [key, webhookId] of Object.entries(webhookIds)) {
        if (!isString(webhookId)) {
          errors.push(`Invalid webhook ID for ${key}`);
          continue;
        }

        try {
          if (key.includes("/")) {
            // It's a repository webhook
            const [owner, repo] = key.split("/");
            if (!owner || !repo) {
              errors.push(
                `Invalid repository format for ${key}. Expected format: owner/repo`
              );
              continue;
            }

            await octokit.request(
              "DELETE /repos/{owner}/{repo}/hooks/{hook_id}",
              {
                owner,
                repo,
                hook_id: parseInt(webhookId, 10),
              }
            );
          } else {
            // It's an organization webhook
            await octokit.request("DELETE /orgs/{org}/hooks/{hook_id}", {
              org: key,
              hook_id: parseInt(webhookId, 10),
            });
          }
        } catch (error: any) {
          errors.push(`Failed to delete webhook for ${key}: ${error.message}`);
        }
      }

      // If some webhooks failed to delete, log the errors but don't fail the entire operation
      if (errors.length > 0) {
        logger.warn(`Some webhooks failed to delete: ${errors.join(", ")}`);
      }

      return new Ok(undefined);
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to delete webhook from GitHub")
      );
    }
  }
}
