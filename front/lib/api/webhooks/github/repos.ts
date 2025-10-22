import { Octokit } from "@octokit/core";

import type { GithubRepository } from "@app/lib/triggers/services/github_webhook_service";
import logger from "@app/logger/logger";

const MAX_PAGES = 5; // Limit to first 500 repos to avoid infinite loops
const REPO_PER_PAGE = 100; // GitHub max is 100

/**
 * Fetches all GitHub repositories accessible by the user with the given access token.
 * This includes:
 * - Repositories the user owns
 * - Repositories the user collaborates on
 * - Repositories from organizations the user belongs to
 *
 * @param accessToken - GitHub OAuth access token
 * @returns Promise resolving to an array of GitHub repositories
 */
export async function getGithubRepositories(
  accessToken: string
): Promise<GithubRepository[]> {
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

  return allRepos.map((repo: any) => ({
    id: repo.id,
    full_name: repo.full_name,
  }));
}
