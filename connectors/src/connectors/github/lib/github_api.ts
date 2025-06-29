import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import { createWriteStream } from "fs";
import { mkdtemp, readdir, rm } from "fs/promises";
import fs from "fs-extra";
import * as reporter from "io-ts-reporters";
import { Octokit, RequestError } from "octokit";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadEntry } from "tar";
import { extract } from "tar";
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici";
import { fetch as undiciFetch, ProxyAgent } from "undici";

import {
  isSupportedDirectory,
  isSupportedFile,
} from "@connectors/connectors/github/lib/code/supported_files";
import {
  isBadCredentials,
  isGithubRequestErrorNotFound,
  isGithubRequestErrorRepositoryAccessBlocked,
  isGithubRequestRedirectCountExceededError,
  RepositoryAccessBlockedError,
  RepositoryNotFoundError,
} from "@connectors/connectors/github/lib/errors";
import type {
  DiscussionCommentNode,
  DiscussionNode,
} from "@connectors/connectors/github/lib/github_graphql";
import {
  ErrorPayloadSchema,
  GetDiscussionCommentRepliesPayloadSchema,
  GetDiscussionCommentsPayloadSchema,
  GetDiscussionPayloadSchema,
  GetRepoDiscussionsPayloadSchema,
} from "@connectors/connectors/github/lib/github_graphql";
import {
  getCodeDirInternalId,
  getCodeFileInternalId,
  getDirectoryUrl,
  getFileUrl,
  getIssueLabels,
} from "@connectors/connectors/github/lib/utils";
import { apiConfig } from "@connectors/lib/api/config";
import {
  ExternalOAuthTokenError,
  ProviderWorkflowError,
} from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  EnvironmentConfig,
  getOAuthConnectionAccessToken,
} from "@connectors/types";

const API_PAGE_SIZE = 100;
const REPOSITORIES_API_PAGE_SIZE = 25;
const MAX_ISSUES_PAGE_SIZE = 100;
export const MAX_REPOSITORIES_PAGE_SIZE = 100;

type GithubOrg = {
  id: number;
  login: string;
};

export type GithubRepo = {
  id: number;
  name: string;
  private: boolean;
  url: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  description?: string | null;
  owner: GithubOrg;
};

export type GithubUser = {
  id: number;
  login: string;
};

export type GithubIssue = {
  id: number;
  number: number;
  title: string;
  url: string;
  creator: GithubUser | null;
  createdAt: Date;
  updatedAt: Date;
  body?: string | null;
  labels: string[];
  isPullRequest: boolean;
};

type GithubIssueComment = {
  id: number;
  url: string;
  creator: GithubUser | null;
  createdAt: Date;
  updatedAt: Date;
  body?: string | null;
};

export async function installationIdFromConnectionId(
  connectionId: string
): Promise<string | null> {
  const tokRes = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    provider: "github",
    connectionId,
  });
  if (tokRes.isErr()) {
    logger.error(
      { connectionId, error: tokRes.error },
      "Error retrieving Github access token"
    );
    return null;
  }

  return (tokRes.value.scrubbed_raw_json as { installation_id: string })[
    "installation_id"
  ];
}

export async function getReposPage(
  connector: ConnectorResource,
  page: number,
  perPage: number = REPOSITORIES_API_PAGE_SIZE
): Promise<Result<GithubRepo[], ExternalOAuthTokenError>> {
  try {
    const octokit = await getOctokit(connector);

    return new Ok(
      (
        await octokit.request("GET /installation/repositories", {
          per_page: perPage,
          page: page,
        })
      ).data.repositories.map((r) => ({
        id: r.id,
        name: r.name,
        private: r.private,
        url: r.html_url,
        createdAt: r.created_at ? new Date(r.created_at) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at) : null,
        description: r.description,
        owner: {
          id: r.owner.id,
          login: r.owner.login,
        },
      }))
    );
  } catch (e) {
    if (isGithubRequestErrorNotFound(e)) {
      return new Err(new ExternalOAuthTokenError(e));
    }
    throw e;
  }
}

export async function getRepo(
  connector: ConnectorResource,
  repoId: number
): Promise<Result<GithubRepo, ExternalOAuthTokenError>> {
  const octokit = await getOctokit(connector);

  try {
    const { data: r } = await octokit.request(`GET /repositories/:repo_id`, {
      repo_id: repoId,
    });

    return new Ok({
      id: r.id,
      name: r.name,
      private: r.private,
      url: r.html_url,
      createdAt: r.created_at ? new Date(r.created_at) : null,
      updatedAt: r.updated_at ? new Date(r.updated_at) : null,
      description: r.description,
      owner: {
        id: r.owner.id,
        login: r.owner.login,
      },
    });
  } catch (err) {
    if (isGithubRequestErrorNotFound(err)) {
      return new Err(new ExternalOAuthTokenError(err));
    }

    throw err;
  }
}

export async function getRepoIssuesPage(
  connector: ConnectorResource,
  repoName: string,
  login: string,
  page: number
): Promise<GithubIssue[]> {
  try {
    const octokit = await getOctokit(connector);

    if (page >= MAX_ISSUES_PAGE_SIZE) {
      logger.warn(
        {
          repoName,
          login,
          connectorId: connector.id,
          page,
        },
        `We cannot obtain more than ${MAX_ISSUES_PAGE_SIZE} pages of issues with the GitHub REST API.`
      );
      return [];
    }

    const issues = (
      await octokit.rest.issues.listForRepo({
        owner: login,
        repo: repoName,
        per_page: API_PAGE_SIZE,
        page: page,
        state: "all",
      })
    ).data;

    return issues.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      url: i.html_url,
      creator: i.user
        ? {
            id: i.user.id,
            login: i.user.login,
          }
        : null,
      createdAt: new Date(i.created_at),
      updatedAt: new Date(i.updated_at),
      body: i.body,
      labels: getIssueLabels(i.labels),
      isPullRequest: !!i.pull_request,
    }));
  } catch (err) {
    if (isBadCredentials(err)) {
      throw new ProviderWorkflowError(
        "github",
        `401 - Transient BadCredentialErrror`,
        "transient_upstream_activity_error"
      );
    }

    if (isGithubRequestErrorNotFound(err)) {
      return [];
    }

    // Handle disabled issues case - GitHub returns 410 Gone when issues are disabled
    if (
      err instanceof RequestError &&
      err.status === 410 &&
      err.message === "Issues are disabled for this repo"
    ) {
      return [];
    }
    throw err;
  }
}

export async function getIssue(
  connector: ConnectorResource,
  repoName: string,
  login: string,
  issueNumber: number,
  logger: Logger
): Promise<GithubIssue | null> {
  try {
    const octokit = await getOctokit(connector);

    const issue = (
      await octokit.rest.issues.get({
        owner: login,
        repo: repoName,
        issue_number: issueNumber,
      })
    ).data;

    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      creator: issue.user
        ? {
            id: issue.user.id,
            login: issue.user.login,
          }
        : null,
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
      body: issue.body,
      labels: getIssueLabels(issue.labels),
      isPullRequest: !!issue.pull_request,
    };
  } catch (err) {
    // Handle excessive redirection or issue not found errors during issue retrieval
    // by safely ignoring the issue and logging the error.
    if (
      isGithubRequestRedirectCountExceededError(err) ||
      isGithubRequestErrorNotFound(err)
    ) {
      logger.info({ err: err.message }, "Failed to get issue.");

      return null;
    }

    if (isBadCredentials(err)) {
      throw new ProviderWorkflowError(
        "github",
        `401 - Transient BadCredentialErrror`,
        "transient_upstream_activity_error"
      );
    }

    throw err;
  }
}

export async function getIssueCommentsPage(
  connector: ConnectorResource,
  repoName: string,
  login: string,
  issueNumber: number,
  page: number
): Promise<GithubIssueComment[]> {
  const octokit = await getOctokit(connector);

  const comments = (
    await octokit.rest.issues.listComments({
      owner: login,
      repo: repoName,
      issue_number: issueNumber,
      per_page: API_PAGE_SIZE,
      page: page,
    })
  ).data;

  return comments.map((c) => ({
    id: c.id,
    url: c.html_url,
    creator: c.user
      ? {
          id: c.user.id,
          login: c.user.login,
        }
      : null,
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at),
    body: c.body,
  }));
}

export async function getRepoDiscussionsPage(
  connector: ConnectorResource,
  repoName: string,
  login: string,
  cursor: string | null = null
): Promise<{ cursor: string | null; discussions: DiscussionNode[] }> {
  const octokit = await getOctokit(connector);
  const d = await octokit.graphql(
    `
      query getDiscussions($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          discussions(first:100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                title
                id
                number
                bodyText
                url
                createdAt
                updatedAt
                author {
                  login
                }
              }
            }
          }
        }
      }
    `,
    {
      owner: login,
      repo: repoName,
      cursor: cursor,
    }
  );

  const errorPayloadValidation = ErrorPayloadSchema.decode(d);
  if (!isLeft(errorPayloadValidation)) {
    throw new Error(JSON.stringify(errorPayloadValidation.right));
  }

  const getRepoDiscussionsPayloadValidation =
    GetRepoDiscussionsPayloadSchema.decode(d);

  if (isLeft(getRepoDiscussionsPayloadValidation)) {
    const pathError = reporter.formatValidationErrors(
      getRepoDiscussionsPayloadValidation.left
    );
    throw new Error(`Unexpected payload: ${pathError.join(", ")}`);
  }

  const payload = getRepoDiscussionsPayloadValidation.right;

  return {
    cursor: payload.repository.discussions.pageInfo.hasNextPage
      ? payload.repository.discussions.pageInfo.endCursor
      : null,
    discussions: payload.repository.discussions.edges.map((e) => e.node),
  };
}

export async function getDiscussionCommentsPage(
  connector: ConnectorResource,
  repoName: string,
  login: string,
  discussionNumber: number,
  cursor: string | null = null
): Promise<{ cursor: string | null; comments: DiscussionCommentNode[] }> {
  const octokit = await getOctokit(connector);
  const d = await octokit.graphql(
    `
    query getDiscussionComments(
      $owner: String!
      $repo: String!
      $discussionNumber: Int!
      $cursor: String
    ) {
      repository(owner: $owner, name: $repo) {
        discussion(number: $discussionNumber) {
          comments(first: 100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                id
                isAnswer
                bodyText
                createdAt
                updatedAt
                author {
                  login
                }
              }
            }
          }
        }
      }
    }
    `,
    {
      owner: login,
      repo: repoName,
      discussionNumber,
      cursor,
    }
  );

  const errorPayloadValidation = ErrorPayloadSchema.decode(d);
  if (!isLeft(errorPayloadValidation)) {
    throw new Error(JSON.stringify(errorPayloadValidation.right));
  }

  const getDiscussionsCommentsPayloadValidation =
    GetDiscussionCommentsPayloadSchema.decode(d);

  if (isLeft(getDiscussionsCommentsPayloadValidation)) {
    const pathError = reporter.formatValidationErrors(
      getDiscussionsCommentsPayloadValidation.left
    );
    throw new Error(`Unexpected payload: ${pathError.join(", ")}`);
  }

  const payload = getDiscussionsCommentsPayloadValidation.right;

  return {
    cursor: payload.repository.discussion.comments.pageInfo.hasNextPage
      ? payload.repository.discussion.comments.pageInfo.endCursor
      : null,
    comments: payload.repository.discussion.comments.edges.map((e) => e.node),
  };
}

export async function getDiscussionCommentRepliesPage(
  connector: ConnectorResource,
  nodeID: string,
  cursor: string | null = null
): Promise<{ cursor: string | null; comments: DiscussionCommentNode[] }> {
  const octokit = await getOctokit(connector);

  const d = await octokit.graphql(
    `
    query getDiscussionCommentReplies(
      $nodeID: ID!
      $cursor: String
    ) {
      node(id: $nodeID) {
        ... on DiscussionComment {
          replies(first: 100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            edges {
              node {
                id
                isAnswer
                bodyText
                createdAt
                updatedAt
                author {
                  login
                }
              }
            }
          }
        }
      }
    }
    `,
    {
      nodeID: nodeID,
      cursor,
    }
  );

  const errorPayloadValidation = ErrorPayloadSchema.decode(d);
  if (!isLeft(errorPayloadValidation)) {
    throw new Error(JSON.stringify(errorPayloadValidation.right));
  }

  const getDiscussionCommentRepliesPayloadValidation =
    GetDiscussionCommentRepliesPayloadSchema.decode(d);

  if (isLeft(getDiscussionCommentRepliesPayloadValidation)) {
    const pathError = reporter.formatValidationErrors(
      getDiscussionCommentRepliesPayloadValidation.left
    );
    throw new Error(`Unexpected payload: ${pathError.join(", ")}`);
  }

  const payload = getDiscussionCommentRepliesPayloadValidation.right;

  return {
    cursor: payload.node.replies.pageInfo.hasNextPage
      ? payload.node.replies.pageInfo.endCursor
      : null,
    comments: payload.node.replies.edges.map((e) => e.node),
  };
}

export async function getDiscussion(
  connector: ConnectorResource,
  repoName: string,
  login: string,
  discussionNumber: number
): Promise<Result<DiscussionNode, Error>> {
  const octokit = await getOctokit(connector);

  let d;
  try {
    d = await octokit.graphql(
      `
    query getDiscussion(
      $owner: String!
      $repo: String!
      $discussionNumber: Int!
    ) {
      repository(owner: $owner, name: $repo) {
        discussion(number: $discussionNumber) {
          title
          id
          number
          bodyText
          url
          createdAt
          updatedAt
          author {
            login
          }
        }
      }
    }
    `,
      {
        owner: login,
        repo: repoName,
        discussionNumber,
      }
    );
  } catch (err) {
    if (err instanceof Error) {
      return new Err(err);
    }
    return new Err(new Error(String(err)));
  }

  const errorPayloadValidation = ErrorPayloadSchema.decode(d);
  if (!isLeft(errorPayloadValidation)) {
    return new Err(new Error(JSON.stringify(errorPayloadValidation.right)));
  }

  const getDiscussionPayloadValidation = GetDiscussionPayloadSchema.decode(d);

  if (isLeft(getDiscussionPayloadValidation)) {
    const pathError = reporter.formatValidationErrors(
      getDiscussionPayloadValidation.left
    );
    return new Err(new Error(`Unexpected payload: ${pathError.join(", ")}`));
  }

  const payload = getDiscussionPayloadValidation.right;

  return new Ok(payload.repository.discussion);
}

export async function getOctokit(
  connector: ConnectorResource
): Promise<Octokit> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "github",
    connectionId: connector.connectionId,
  });

  if (connector.useProxy) {
    const myFetch = (url: UndiciRequestInfo, options: UndiciRequestInit) =>
      undiciFetch(url, {
        ...options,
        dispatcher: new ProxyAgent(
          `http://${EnvironmentConfig.getEnvVariable(
            "PROXY_USER_NAME"
          )}:${EnvironmentConfig.getEnvVariable(
            "PROXY_USER_PASSWORD"
          )}@${EnvironmentConfig.getEnvVariable(
            "PROXY_HOST"
          )}:${EnvironmentConfig.getEnvVariable("PROXY_PORT")}`
        ),
      });

    return new Octokit({
      auth: token.access_token,
      request: { fetch: myFetch },
    });
  }

  return new Octokit({ auth: token.access_token });
}

// Repository processing

async function* getFiles(dir: string): AsyncGenerator<string> {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      // blacklist
      if (!isSupportedDirectory(dirent.name)) {
        continue;
      }
      yield* getFiles(res);
    } else {
      yield res;
    }
  }
}

// This function returns file and directories object with parent, internalIds, and sourceUrl
// information. The root of the directory is considered the null parent (and will have to be
// stitched by the activity).
export async function processRepository({
  connector,
  repoLogin,
  repoName,
  repoId,
  onEntry,
  logger,
}: {
  connector: ConnectorResource;
  repoLogin: string;
  repoName: string;
  repoId: number;
  onEntry: (entry: ReadEntry) => void;
  logger: Logger;
}): Promise<
  Result<
    {
      tempDir: string;
      files: {
        fileName: string;
        filePath: string[];
        sourceUrl: string;
        sizeBytes: number;
        documentId: string;
        parentInternalId: string | null;
        parents: string[];
        localFilePath: string;
      }[];
      directories: {
        dirName: string;
        dirPath: string[];
        sourceUrl: string;
        internalId: string;
        parentInternalId: string | null;
        parents: string[];
      }[];
    },
    | RepositoryAccessBlockedError
    | ExternalOAuthTokenError
    | RepositoryNotFoundError
  >
> {
  const octokit = await getOctokit(connector);

  let data;
  try {
    const response = await octokit.rest.repos.get({
      owner: repoLogin,
      repo: repoName,
    });
    data = response.data;
  } catch (err) {
    if (isGithubRequestErrorNotFound(err)) {
      return new Err(new RepositoryNotFoundError(err));
    }
    throw err;
  }
  const defaultBranch = data.default_branch;

  logger.info({ defaultBranch, size: data.size }, "Retrieved repository info");

  // `data.size` is the whole repo size in KB, we use it to filter repos > 10GB download size. There
  // is further filtering by file type + for "extracted size" per file to 1MB.
  if (data.size > 10 * 1024 * 1024) {
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
        repoLogin,
        repoName,
        size: data.size,
        connectorId: connector.id,
        panic: true,
      },
      `Github Repository is too large to sync (size: ${data.size}KB, max: 10GB)`
    );
  }

  octokit.request.defaults({
    request: {
      parseSuccessResponseBody: false,
    },
  });

  let tarballStream;
  try {
    tarballStream = (
      (await octokit.request("GET /repos/{owner}/{repo}/tarball/{ref}", {
        owner: repoLogin,
        repo: repoName,
        ref: defaultBranch,
        request: {
          parseSuccessResponseBody: false,
        },
      })) as { data: Readable }
    ).data;
  } catch (err) {
    if (isGithubRequestErrorNotFound(err)) {
      return new Err(new ExternalOAuthTokenError(err));
    }
    if (isGithubRequestErrorRepositoryAccessBlocked(err)) {
      return new Err(new RepositoryAccessBlockedError(err));
    }

    throw err;
  }

  // Create a temp directory.
  const tempDir = await mkdtemp(join(tmpdir(), "repo-"));

  try {
    const tarPath = resolve(tempDir, "repo.tar.gz");

    logger.info({ tempDir, tarPath }, "Starting download of tarball");

    // Save the tarball to the temp directory.
    await pipeline(tarballStream, createWriteStream(tarPath));

    const { size } = await fs.stat(tarPath);

    logger.info({ tarSize: size, tarPath }, "Finished tarball download");

    // Extract the tarball.
    await extract({
      file: tarPath,
      cwd: tempDir,
      // Filter before extraction to avoid extracting files we don't want.
      filter: (path, stat) => {
        if (path.endsWith("/")) {
          return true;
        }

        const isUnderLimit = stat.size < 1024 * 1024;

        if (!isUnderLimit) {
          logger.info({ path, size }, "File is over the size limit, skipping.");
          return false;
        }

        const isWhitelisted = isSupportedFile(path);

        if (!isWhitelisted) {
          return false;
        }

        return true;
      },
      onentry: onEntry,
    });

    // Delete the tarball.
    await fs.unlink(tarPath);

    const files: {
      fileName: string;
      filePath: string[];
      sourceUrl: string;
      sizeBytes: number;
      documentId: string;
      parentInternalId: string | null;
      parents: string[];
      localFilePath: string;
    }[] = [];
    const seenDirs: { [key: string]: boolean } = {};
    const directories: {
      dirName: string;
      dirPath: string[];
      sourceUrl: string;
      internalId: string;
      parentInternalId: string | null;
      parents: string[];
    }[] = [];

    // Iterate over the files in the temp directory.
    for await (const file of getFiles(tempDir)) {
      const path = file
        .substring(tempDir.length + 1)
        .split("/")
        .slice(1, -1);
      const fileName = basename(file);

      const parents = [];
      // we order parents bottom to top, so we take paths in the opposite order
      for (let i = path.length - 1; i >= 0; i--) {
        parents.push({
          internalId: getCodeDirInternalId(
            repoId,
            path.slice(0, i + 1).join("/")
          ),
          dirName: path[i] as string,
          dirPath: path.slice(0, i),
        });
      }

      const documentId = getCodeFileInternalId(
        repoId,
        `${path.join("/")}/${fileName}`
      );

      const parentInternalId = parents[0]?.internalId ?? null;

      // Files
      files.push({
        fileName,
        filePath: path,
        sourceUrl: getFileUrl(
          repoLogin,
          repoName,
          defaultBranch,
          path,
          fileName
        ),
        sizeBytes: size,
        documentId,
        parentInternalId,
        parents: [documentId, ...parents.map((p) => p.internalId)],
        localFilePath: file,
      });

      // Directories
      for (let i = 0; i < parents.length; i++) {
        const p = parents[i];
        if (p && !seenDirs[p.internalId]) {
          seenDirs[p.internalId] = true;

          const dirParent = parents[i + 1];
          const dirParentInternalId = dirParent ? dirParent.internalId : null;

          directories.push({
            dirName: p.dirName,
            dirPath: p.dirPath,
            sourceUrl: getDirectoryUrl(
              repoLogin,
              repoName,
              defaultBranch,
              p.dirPath,
              p.dirName
            ),
            internalId: p.internalId,
            parentInternalId: dirParentInternalId,
            parents: parents.slice(i).map((p) => p.internalId),
          });
        }
      }
    }

    return new Ok({
      tempDir,
      files,
      directories,
    });
  } catch (e) {
    logger.info(
      { error: e },
      "Caught exception while processing repository, cleaning up"
    );
    await cleanUpProcessRepository(tempDir);
    throw e;
  }
}

export async function cleanUpProcessRepository(tempDir: string) {
  // Delete the temp directory.
  await rm(tempDir, { recursive: true });
}
