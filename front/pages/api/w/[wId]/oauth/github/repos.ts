import { Octokit } from "@octokit/core";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI } from "@app/types";
import logger from "@app/logger/logger";

const MAX_PAGES = 5; // Limit to first 500 repos to avoid infinite loops
const REPO_PER_PAGE = 100; // GitHub max is 100

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
  res: NextApiResponse<WithAPIErrorResponse<GetGithubRepositoriesResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      // Only builders can access GitHub repositories
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only builders can access GitHub repositories",
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

        // Fetch repositories using Octokit
        const octokit = new Octokit({ auth: accessToken });

        // Fetch user repositories
        const allRepos: any[] = [];
        let page = 1;

        while (page <= MAX_PAGES) {
          const { data } = await octokit.request("GET /user/repos", {
            per_page: REPO_PER_PAGE,
            page: page,
            sort: "full_name",
            affiliation: "owner,collaborator,organization_member",
            visibility: "all",
          });

          allRepos.push(...data);

          if (data.length < REPO_PER_PAGE) {
            break;
          }

          page++;
        }

        // Also fetch repositories from organizations the user belongs to
        // This catches repos where the user has admin access via org membership
        try {
          const { data: orgs } = await octokit.request("GET /user/orgs", {
            per_page: REPO_PER_PAGE,
          });

          for (const org of orgs) {
            page = 1;
            while (page <= MAX_PAGES) {
              const { data: orgRepos } = await octokit.request(
                "GET /orgs/{org}/repos",
                {
                  org: org.login,
                  per_page: REPO_PER_PAGE,
                  page: page,
                  type: "all",
                }
              );

              // Only add repos that aren't already in the list
              for (const repo of orgRepos) {
                if (!allRepos.find((r) => r.id === repo.id)) {
                  allRepos.push(repo);
                }
              }

              if (orgRepos.length < REPO_PER_PAGE) {
                break;
              }

              page++;
            }
          }
        } catch (error) {
          // If fetching org repos fails, continue with what we have
          logger.error({ err: error }, "Failed to fetch org repos");
        }

        // Sort by full_name for easier browsing
        allRepos.sort((a, b) => a.full_name.localeCompare(b.full_name));

        const repositories = allRepos.map((repo: any) => ({
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
