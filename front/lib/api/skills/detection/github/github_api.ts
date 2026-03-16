import type { GitHubSkillDetectionError } from "@app/lib/api/skills/detection/github/types";
import logger from "@app/logger/logger";
import { Ok, type Result } from "@app/types/shared/result";
import { Octokit } from "@octokit/core";

async function callGitHubAPI<T>(
  fn: () => Promise<OctokitResponse<T>>,
  { owner, repo, context }: { owner: string; repo: string; context: string }
): Promise<Result<T, GitHubSkillDetectionError>> {
  try {
    const response = await fn();
    return new Ok(response.data);
  } catch (err) {
    const error = normalizeError(err);

    if (error.message.includes("Not Found")) {
      return new Err({
        type: "not_found",
        message: `Repository "${owner}/${repo}" not found.`,
      });
    }

    if (
      error.message.includes("Bad credentials") ||
      error.message.includes("401")
    ) {
      return new Err({
        type: "auth_error",
        message: `Authentication failed for repository "${owner}/${repo}".`,
      });
    }

    if (error.message.includes("rate limit")) {
      return new Err({
        type: "github_api_error",
        message: "GitHub API rate limit exceeded. Please try again later.",
      });
    }

    logger.error({ error: error.message, owner, repo }, context);

    return new Err({
      type: "github_api_error",
      message: context,
    });
  }
}

export async function fetchRepoTree(
  octokit: InstanceType<typeof Octokit>,
  {
    owner,
    repo,
  }: {
    owner: string;
    repo: string;
  }
): Promise<Result<GitHubTreeEntry[], GitHubSkillDetectionError>> {
  const result = await callGitHubAPI(
    async () =>
      octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
        owner,
        repo,
        tree_sha: "HEAD",
        recursive: "1",
      }),
    { owner, repo, context: "Failed to fetch repository tree" }
  );
  if (result.isErr()) {
    return result;
  }

  const parsed = GitHubTreeResponseSchema.safeParse(result.value);
  if (!parsed.success) {
    return new Err({
      type: "github_api_error",
      message: `Invalid tree response from GitHub: ${parsed.error.message}`,
    });
  }

  if (parsed.data.truncated) {
    logger.warn(
      { owner, repo },
      "GitHub tree response was truncated; some skills may be missed."
    );
  }

  return new Ok(parsed.data.tree);
}

/**
 * Fetches a blob's raw base64 content from GitHub.
 */
export async function fetchBlobContent(
  octokit: InstanceType<typeof Octokit>,
  {
    owner,
    repo,
    fileSha,
  }: {
    owner: string;
    repo: string;
    fileSha: string;
  }
): Promise<Result<string, GitHubSkillDetectionError>> {
  const result = await callGitHubAPI(
    async () =>
      octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
        owner,
        repo,
        file_sha: fileSha,
      }),
    { owner, repo, context: "Failed to fetch file content" }
  );
  if (result.isErr()) {
    return result;
  }

  const parsed = GitHubBlobResponseSchema.safeParse(result.value);
  if (!parsed.success) {
    return new Err({
      type: "github_api_error",
      message: `Invalid blob response from GitHub: ${parsed.error.message}`,
    });
  }

  return new Ok(parsed.data.content);
}

export function initGitHubRepoClient({
  repoUrl,
  accessToken,
}: {
  repoUrl: string;
  accessToken?: string | null;
}): Result<
  { octokit: InstanceType<typeof Octokit>; owner: string; repo: string },
  GitHubSkillDetectionError
> {
  const parseResult = parseGitHubRepoUrl(repoUrl);
  if (parseResult.isErr()) {
    return parseResult;
  }
  const { owner, repo } = parseResult.value;
  const octokit = new Octokit(accessToken ? { auth: accessToken } : {});
  return new Ok({ octokit, owner, repo });
}
