import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { Octokit } from "@octokit/core";

import { GITHUB_NODE_QUERY } from "@app/lib/providers/github/graphql";
import { GitHubNodeQueryResponseSchema } from "@app/lib/providers/github/types";
import type {
  GitHubGraphQLNodeParams,
  GitHubNodeQueryResponse,
  GitHubSearchIssuesParams,
  GitHubSearchIssuesResponse,
} from "@app/lib/providers/github/types";
import { normalizeError } from "@app/types";

function getGitHubClient(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

export async function searchGitHubIssues({
  accessToken,
  query,
  pageSize,
}: GitHubSearchIssuesParams): Promise<
  Result<GitHubSearchIssuesResponse, { message: string }>
> {
  const github = getGitHubClient(accessToken);

  try {
  // Use GitHub's REST API for search
  // The /search/issues endpoint gives both issues and PRs
  // GitHub's default "best match" search balances relevance and recency
    const response = await github.request("GET /search/issues", {
      q: query,
      per_page: Math.min(pageSize, 100),
    });
    return new Ok(response.data as GitHubSearchIssuesResponse);
  } catch (error) {
    return new Err({
      message: normalizeError(error).message,
    });
  }
}

export async function fetchGitHubGraphQLNode({
  accessToken,
  nodeId,
}: GitHubGraphQLNodeParams): Promise<
  Result<GitHubNodeQueryResponse, { message: string }>
> {
  const github = getGitHubClient(accessToken);

  // Fetch from GraphQL API
  let rawResult: unknown;
  try {
    rawResult = await github.graphql(GITHUB_NODE_QUERY, {
      nodeId,
    });
  } catch (error) {
    return new Err({
      message: `Failed to fetch GitHub node: ${normalizeError(error).message}`,
    });
  }

  // Validate response with Zod
  const parseResult = GitHubNodeQueryResponseSchema.safeParse(rawResult);
  if (!parseResult.success) {
    return new Err({
      message: `Invalid response from GitHub API: ${parseResult.error.message}`,
    });
  }

  return new Ok(parseResult.data);
}
