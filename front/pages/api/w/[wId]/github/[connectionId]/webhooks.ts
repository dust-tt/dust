import { Octokit } from "@octokit/core";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString, OAuthAPI } from "@app/types";

export type CreateGithubWebhookResponseType = {
  webhook: {
    id: number;
    url: string;
    active: boolean;
  };
};

export type DeleteGithubWebhookResponseType = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      CreateGithubWebhookResponseType | DeleteGithubWebhookResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only builders can create GitHub webhooks",
          },
        });
      }

      const { connectionId, remoteMetadata, webhookUrl, events, secret } =
        req.body;

      if (!connectionId || typeof connectionId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "connectionId is required",
          },
        });
      }

      if (!remoteMetadata || typeof remoteMetadata !== "object") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "remoteMetadata is required",
          },
        });
      }

      if (!webhookUrl || typeof webhookUrl !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "webhookUrl is required",
          },
        });
      }

      if (!Array.isArray(events) || events.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "events array is required",
          },
        });
      }

      try {
        // Get access token from OAuth API
        const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

        // First, verify the connection belongs to this workspace
        const metadataRes = await oauthAPI.getConnectionMetadata({
          connectionId,
        });

        if (metadataRes.isErr()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: "GitHub connection not found",
            },
          });
        }

        const workspace = auth.workspace();
        if (!workspace) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "workspace_not_found",
              message: "Workspace not found",
            },
          });
        }

        const workspaceId = metadataRes.value.connection.metadata.workspace_id;
        if (!workspaceId || workspaceId !== workspace.sId) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "Connection does not belong to this workspace",
            },
          });
        }

        const tokenRes = await oauthAPI.getAccessToken({ connectionId });

        if (tokenRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to get GitHub access token",
            },
          });
        }

        const accessToken = tokenRes.value.access_token;
        const octokit = new Octokit({ auth: accessToken });

        // Extract repository from remoteMetadata
        const repositoryFullName = remoteMetadata.repository;
        if (!repositoryFullName || typeof repositoryFullName !== "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "remoteMetadata.repository is required",
            },
          });
        }

        const [owner, repo] = repositoryFullName.split("/");
        if (!owner || !repo) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid repository full name format. Expected: owner/repo",
            },
          });
        }

        // First, check the OAuth token scopes and repository permissions
        try {
          // Check what scopes the token has
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
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "invalid_request_error",
                message: `You need admin permissions on ${repositoryFullName} to create webhooks. Current permissions: ${JSON.stringify(repoData.permissions)}. Token scopes: ${scopes}`,
              },
            });
          }
        } catch (error: any) {
          return apiError(req, res, {
            status_code: error.status || 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to check repository permissions: ${error.message}`,
            },
          });
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
              secret: secret || undefined,
              insecure_ssl: "0",
            },
          }
        );

        return res.status(201).json({
          webhook: {
            id: webhook.id,
            url: webhook.url,
            active: webhook.active,
          },
        });
      } catch (error: any) {
        return apiError(req, res, {
          status_code: error.status || 500,
          api_error: {
            type: "internal_server_error",
            message: error.message || "Failed to create webhook",
          },
        });
      }

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only builders can delete GitHub webhooks",
          },
        });
      }

      const deleteConnectionId = req.query.connectionId;

      if (!deleteConnectionId || typeof deleteConnectionId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "connectionId is required",
          },
        });
      }

      const { webhookSourceId } = req.query;

      if (!isString(webhookSourceId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "webhookSourceId is required",
          },
        });
      }

      try {
        // Fetch the webhook source to get remote metadata
        const webhookSourceResource = await WebhookSourceResource.fetchById(
          auth,
          webhookSourceId
        );

        if (!webhookSourceResource) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "webhook_source_not_found",
              message: "Webhook source not found",
            },
          });
        }

        // Verify the webhook source belongs to this connection
        if (webhookSourceResource.oauthConnectionId !== deleteConnectionId) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Webhook source does not belong to this connection",
            },
          });
        }

        const deleteRemoteMetadata = webhookSourceResource.remoteMetadata;

        if (!deleteRemoteMetadata || typeof deleteRemoteMetadata !== "object") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Webhook source has no remote metadata",
            },
          });
        }

        if (
          !deleteRemoteMetadata.id ||
          typeof deleteRemoteMetadata.id !== "string"
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Remote metadata missing webhook id",
            },
          });
        }

        const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

        // First, verify the connection belongs to this workspace
        const metadataRes = await oauthAPI.getConnectionMetadata({
          connectionId: deleteConnectionId,
        });

        if (metadataRes.isErr()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: "GitHub connection not found",
            },
          });
        }

        const workspace = auth.workspace();
        if (!workspace) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "workspace_not_found",
              message: "Workspace not found",
            },
          });
        }

        const workspaceId = metadataRes.value.connection.metadata.workspace_id;
        if (!workspaceId || workspaceId !== workspace.sId) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "Connection does not belong to this workspace",
            },
          });
        }

        const tokenRes = await oauthAPI.getAccessToken({
          connectionId: deleteConnectionId,
        });

        if (tokenRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to get GitHub access token",
            },
          });
        }

        const accessToken = tokenRes.value.access_token;
        const octokit = new Octokit({ auth: accessToken });

        // Extract repository from remoteMetadata
        const deleteRepositoryFullName = deleteRemoteMetadata.repository;
        if (
          !deleteRepositoryFullName ||
          typeof deleteRepositoryFullName !== "string"
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "remoteMetadata.repository is required",
            },
          });
        }

        const [owner, repo] = deleteRepositoryFullName.split("/");
        if (!owner || !repo) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid repository full name format. Expected: owner/repo",
            },
          });
        }
        await octokit.request("DELETE /repos/{owner}/{repo}/hooks/{hook_id}", {
          owner,
          repo,
          hook_id: parseInt(deleteRemoteMetadata.id, 10),
        });

        return res.status(200).json({
          success: true,
        });
      } catch (error: any) {
        return apiError(req, res, {
          status_code: error.status || 500,
          api_error: {
            type: "internal_server_error",
            message: error.message || "Failed to delete webhook from GitHub",
          },
        });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
