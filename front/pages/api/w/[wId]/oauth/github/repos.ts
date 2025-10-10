import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI } from "@app/types/oauth/oauth_api";

export type GithubRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
};

export type GetGithubReposResponseBody = {
  repos: GithubRepo[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetGithubReposResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET is supported.",
      },
    });
  }

  const { connectionId, token } = req.query;

  let accessToken: string;

  if (token && typeof token === "string") {
    // Direct token provided
    accessToken = token;
  } else if (connectionId && typeof connectionId === "string") {
    // OAuth connection ID provided
    try {
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
      const tokenRes = await oauthAPI.getAccessToken({ connectionId });

      if (tokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to get access token for GitHub connection.",
          },
        });
      }

      accessToken = tokenRes.value.access_token;
    } catch (error) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to get access token for GitHub connection.",
        },
      });
    }
  } else {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token or connectionId parameter.",
      },
    });
  }

  try {

    // Try to fetch repositories - first try user repos (OAuth), then installation repos (GitHub App)
    let repos: GithubRepo[] = [];

    // Try user repositories endpoint (for OAuth tokens)
    let response = await fetch(
      "https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      repos = (data || []).map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
      }));
    } else {
      // If that fails, try installation repositories endpoint (for GitHub App)
      response = await fetch(
        "https://api.github.com/installation/repositories?per_page=100",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();
      repos = (data.repositories || []).map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
      }));
    }

    return res.status(200).json({ repos });
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Failed to fetch GitHub repositories"
    );

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch GitHub repositories.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
