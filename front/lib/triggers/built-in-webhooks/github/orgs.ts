import { Octokit } from "@octokit/core";

import type { GithubOrganization } from "@app/lib/triggers/built-in-webhooks/github/types";
import { isGithubOrganization } from "@app/lib/triggers/built-in-webhooks/github/types";

const ORGS_PER_PAGE = 100; // GitHub max is 100

/**
 * Fetches all GitHub organizations that the user belongs to.
 *
 * @param accessToken - GitHub OAuth access token
 * @returns Promise resolving to an array of GitHub organizations
 */
export async function getGithubOrganizations(
  accessToken: string
): Promise<GithubOrganization[]> {
  const octokit = new Octokit({ auth: accessToken });

  const { data: orgs } = await octokit.request("GET /user/orgs", {
    per_page: ORGS_PER_PAGE,
  });

  return orgs.map((org: any): GithubOrganization => {
    const organization = { name: org.login };
    if (!isGithubOrganization(organization)) {
      throw new Error(
        `Invalid GithubOrganization data: ${JSON.stringify(organization)}`
      );
    }
    return organization;
  });
}
