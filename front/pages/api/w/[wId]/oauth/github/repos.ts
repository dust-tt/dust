import type { NextApiRequest, NextApiResponse } from "next";
import { Octokit } from "@octokit/core";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI } from "@app/types";

export type GetGithubRepositoriesResponseType = {
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
  }>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetGithubRepositoriesResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
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

        // Fetch repositories using Octokit
        const octokit = new Octokit({ auth: accessToken });

        const { data } = await octokit.request("GET /user/repos", {
          per_page: 100,
          sort: "updated",
        });

        const repositories = data.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          html_url: repo.html_url,
        }));

        return res.status(200).json({ repositories });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to fetch repositories",
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
