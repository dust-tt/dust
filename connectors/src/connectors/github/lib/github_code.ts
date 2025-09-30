import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Octokit } from "octokit";

import {
  isGithubRequestErrorNotFound,
  RepositoryNotFoundError,
} from "@connectors/connectors/github/lib/errors";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { fileSizeToHumanReadable } from "@connectors/types";

const REPO_SIZE_LIMIT = 10 * 1024 * 1024; // 10GB in KB

const CONNECTORS_WHITELISTED_FOR_LARGE_REPOS = [50];

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

export function isRepoTooLarge(
  repoInfo: RepositoryInfo,
  connector: ConnectorResource
): boolean {
  // `data.size` is the whole repo size in KB, we use it to filter repos > 10GB download size. There
  // is further filtering by file type + for "extracted size" per file to 3MB.
  if (repoInfo.size > REPO_SIZE_LIMIT) {
    // We throw a panic log and skip to keep track of the very large repositories and report to the user.
    // The rest of the sync is not affected. Please check out the runbook:
    // https://www.notion.so/dust-tt/Panic-Log-Github-repository-too-large-to-sync-1bf28599d9418061a396d2378bdd77de?pvs=4

    // Some connectors are whitelisted to sync large repositories.
    // This is on a connectorId basis to avoid leaking repository names.
    if (CONNECTORS_WHITELISTED_FOR_LARGE_REPOS.includes(connector.id)) {
      return false;
    }

    logger.error(
      {
        repoLogin: repoInfo.owner.login,
        repoName: repoInfo.name,
        size: repoInfo.size,
        panic: true,
      },
      `GitHub repository too large to sync (size: ${fileSizeToHumanReadable(repoInfo.size * 1024)}, max: 10 GB).`
    );

    return true;
  }

  return false;
}
