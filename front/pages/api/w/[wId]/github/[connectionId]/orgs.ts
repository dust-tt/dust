import { Octokit } from "@octokit/core";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI } from "@app/types";

const ORGS_PER_PAGE = 100; // GitHub max is 100

export type GetGithubOrganizationsResponseType = {
  organizations: Array<{
    id: number;
    login: string;
    avatar_url: string;
    description: string | null;
  }>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetGithubOrganizationsResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      // Only builders can access GitHub organizations
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only builders can access GitHub organizations",
          },
        });
      }

      const { connectionId } = req.query;

      if (!connectionId || typeof connectionId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "connectionId is required",
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

        // Fetch organizations using Octokit
        const octokit = new Octokit({ auth: accessToken });

        const { data: orgs } = await octokit.request("GET /user/orgs", {
          per_page: ORGS_PER_PAGE,
        });

        const organizations = orgs.map((org: any) => ({
          id: org.id,
          login: org.login,
          avatar_url: org.avatar_url,
          description: org.description,
        }));

        return res.status(200).json({ organizations });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to fetch organizations",
          },
        });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
