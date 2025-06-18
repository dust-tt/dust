import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Octokit } from "octokit";

import {
  isGithubRequestErrorNotFound,
  RepositoryNotFoundError,
} from "@connectors/connectors/github/lib/errors";
import logger from "@connectors/logger/logger";

const REPO_SIZE_LIMIT = 10 * 1024 * 1024; // 10GB in KB

export type RepositoryInfo = Pick<
  Awaited<ReturnType<Octokit["rest"]["repos"]["get"]>>["data"],
  "default_branch" | "size" | "owner" | "name"
>;

export async function getRepoInfo(
  octokit: Octokit,
  {
    repoLogin,
    repoName,
  }: {
    repoLogin: string;
    repoName: string;
  }
): Promise<Result<RepositoryInfo, RepositoryNotFoundError>> {
  try {
    const response = await octokit.rest.repos.get({
      owner: repoLogin,
      repo: repoName,
    });
    const data = response.data;

    const defaultBranch = data.default_branch;

    logger.info(
      { defaultBranch, size: data.size },
      "Retrieved repository info"
    );

    return new Ok(data);
  } catch (err) {
    if (isGithubRequestErrorNotFound(err)) {
      return new Err(new RepositoryNotFoundError(err));
    }
    throw err;
  }
}

export function isRepoTooLarge(repoInfo: RepositoryInfo): boolean {
  // `data.size` is the whole repo size in KB, we use it to filter repos > 10GB download size. There
  // is further filtering by file type + for "extracted size" per file to 1MB.
  if (repoInfo.size > REPO_SIZE_LIMIT) {
    // For now we throw a panic log, so we are able to report the issue to the
    // user, and continue with the rest of the sync. See runbook for future
    // improvements
    // https://www.notion.so/dust-tt/Panic-Log-Github-repository-too-large-to-sync-1bf28599d9418061a396d2378bdd77de?pvs=4

    // Later on, we might want to build capabilities to handle this (likely a
    // typed error to return a syncFailed to the user, when we are able to
    // display granular failure, or increase this limit if we want some largers
    // repositories).

    logger.error(
      {
        repoLogin: repoInfo.owner.login,
        repoName: repoInfo.name,
        size: repoInfo.size,
        panic: true,
      },
      `Github Repository is too large to sync (size: ${repoInfo.size}KB, max: 10GB)`
    );

    return true;
  }

  return false;
}
