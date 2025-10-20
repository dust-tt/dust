import { Octokit } from "@octokit/core";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types";
import { Err, isString, OAuthAPI, Ok } from "@app/types";

import type { RemoteWebhookService } from "./remote_webhook_service";

export class GitHubWebhookService implements RemoteWebhookService {
  async createWebhooks(params: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, any>;
    webhookUrl: string;
    events: string[];
    secret?: string;
  }): Promise<
    Result<
      {
        webhookIds: Record<string, string>;
        errors?: string[];
      },
      Error
    >
  > {
    const { auth, connectionId, remoteMetadata, webhookUrl, events, secret } =
      params;

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

      // Extract repository from remoteMetadata
      const repository = remoteMetadata.repository;
      if (!isString(repository)) {
        return new Err(new Error("remoteMetadata.repository is required"));
      }

      const [owner, repo] = repository.split("/");
      if (!owner || !repo) {
        return new Err(
          new Error("Invalid repository format. Expected format: owner/repo")
        );
      }

      // Check the OAuth token scopes and repository permissions
      try {
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
          return new Err(
            new Error(
              `You need admin permissions on ${repository} to create webhooks. Current permissions: ${JSON.stringify(repoData.permissions)}. Token scopes: ${scopes}`
            )
          );
        }
      } catch (error: any) {
        return new Err(
          new Error(`Failed to check repository permissions: ${error.message}`)
        );
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

      return new Ok({
        webhookIds: { [repository]: String(webhook.id) },
      });
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to create GitHub webhooks")
      );
    }
  }

  async deleteWebhooks(params: {
    auth: Authenticator;
    connectionId: string;
    remoteMetadata: Record<string, any>;
  }): Promise<Result<void, Error>> {
    const { auth, connectionId, remoteMetadata } = params;

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

      const webhookId = remoteMetadata.webhookId;
      const repository = remoteMetadata.repository;
      if (!isString(webhookId)) {
        return new Err(new Error("Remote metadata missing webhook id"));
      }

      if (!isString(repository)) {
        return new Err(new Error("Remote metadata missing repository"));
      }

      // Parse repository (format: owner/repo)
      const [owner, repo] = repository.split("/");
      if (!owner || !repo) {
        return new Err(
          new Error("Invalid repository format. Expected format: owner/repo")
        );
      }

      // Delete the webhook
      await octokit.request("DELETE /repos/{owner}/{repo}/hooks/{hook_id}", {
        owner,
        repo,
        hook_id: parseInt(webhookId, 10),
      });

      return new Ok(undefined);
    } catch (error: any) {
      return new Err(
        new Error(error.message || "Failed to delete webhook from GitHub")
      );
    }
  }
}
