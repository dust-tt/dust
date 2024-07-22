import type { Result } from "@dust-tt/types";
import { Err, getOAuthConnectionAccessToken, Ok } from "@dust-tt/types";
import { hash as blake3 } from "blake3";
import { isLeft } from "fp-ts/lib/Either";
import { createWriteStream } from "fs";
import { mkdtemp, readdir, rm } from "fs/promises";
import fs from "fs-extra";
import * as reporter from "io-ts-reporters";
import { Octokit } from "octokit";
import { tmpdir } from "os";
import { basename, extname, join, resolve } from "path";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import { extract } from "tar";

import {
  isGithubRequestErrorNotFound,
  isGithubRequestRedirectCountExceededError,
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
import { apiConfig } from "@connectors/lib/api/config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import logger from "@connectors/logger/logger";

const API_PAGE_SIZE = 100;

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
  connectionId: string,
  page: number
): Promise<Result<GithubRepo[], ExternalOAuthTokenError>> {
  try {
    const octokit = await getOctokit(connectionId);

    return new Ok(
      (
        await octokit.request("GET /installation/repositories", {
          per_page: API_PAGE_SIZE,
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
  connectionId: string,
  repoId: number
): Promise<GithubRepo> {
  const octokit = await getOctokit(connectionId);

  const { data: r } = await octokit.request(`GET /repositories/:repo_id`, {
    repo_id: repoId,
  });

  return {
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
  };
}

export async function getRepoIssuesPage(
  connectionId: string,
  repoName: string,
  login: string,
  page: number
): Promise<GithubIssue[]> {
  const octokit = await getOctokit(connectionId);

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
    isPullRequest: !!i.pull_request,
  }));
}

export async function getIssue(
  connectionId: string,
  repoName: string,
  login: string,
  issueNumber: number,
  loggerArgs: Record<string, string | number>
): Promise<GithubIssue | null> {
  const octokit = await getOctokit(connectionId);

  try {
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
      isPullRequest: !!issue.pull_request,
    };
  } catch (err) {
    // Handle excessive redirection or issue not found errors during issue retrieval
    // by safely ignoring the issue and logging the error.
    if (
      isGithubRequestRedirectCountExceededError(err) ||
      isGithubRequestErrorNotFound(err)
    ) {
      logger.info({ ...loggerArgs, err: err.message }, "Failed to get issue.");

      return null;
    }

    throw err;
  }
}

export async function getIssueCommentsPage(
  connectionId: string,
  repoName: string,
  login: string,
  issueNumber: number,
  page: number
): Promise<GithubIssueComment[]> {
  const octokit = await getOctokit(connectionId);

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
  connectionId: string,
  repoName: string,
  login: string,
  cursor: string | null = null
): Promise<{ cursor: string | null; discussions: DiscussionNode[] }> {
  const octokit = await getOctokit(connectionId);
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
  connectionId: string,
  repoName: string,
  login: string,
  discussionNumber: number,
  cursor: string | null = null
): Promise<{ cursor: string | null; comments: DiscussionCommentNode[] }> {
  const octokit = await getOctokit(connectionId);
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
  connectionId: string,
  nodeID: string,
  cursor: string | null = null
): Promise<{ cursor: string | null; comments: DiscussionCommentNode[] }> {
  const octokit = await getOctokit(connectionId);

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
  connectionId: string,
  repoName: string,
  login: string,
  discussionNumber: number
): Promise<DiscussionNode> {
  const octokit = await getOctokit(connectionId);

  const d = await octokit.graphql(
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

  const errorPayloadValidation = ErrorPayloadSchema.decode(d);
  if (!isLeft(errorPayloadValidation)) {
    throw new Error(JSON.stringify(errorPayloadValidation.right));
  }

  const getDiscussionPayloadValidation = GetDiscussionPayloadSchema.decode(d);

  if (isLeft(getDiscussionPayloadValidation)) {
    const pathError = reporter.formatValidationErrors(
      getDiscussionPayloadValidation.left
    );
    throw new Error(`Unexpected payload: ${pathError.join(", ")}`);
  }

  const payload = getDiscussionPayloadValidation.right;

  return payload.repository.discussion;
}

export async function getOctokit(connectionId: string): Promise<Octokit> {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "github",
    connectionId,
  });

  return new Octokit({ auth: token.access_token });
}

// Repository processing

const EXTENSION_WHITELIST = [
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".rb",
  ".py",
  ".rs",
  ".go",
  ".swift",
  ".css",
  ".html",
  ".less",
  ".sass",
  ".scss",
  ".php",
  ".java",
  ".yaml",
  ".yml",
  ".md",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".sh",
  ".sql",
  ".kt",
  ".kts",
];

const SUFFIX_BLACKLIST = [".min.js", ".min.css"];

const FILENAME_WHITELIST = [
  "README",
  "Dockerfile",
  "package.json",
  "Cargo.toml",
];

const DIRECTORY_BLACKLIST = [
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "pkg",
  "bundle",
  "built",
  "eggs",
  "downloads",
  "env",
  "venv",
  "tmp",
  "temp",
  "debug",
  "target",
];

async function* getFiles(dir: string): AsyncGenerator<string> {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      // blacklist
      if (DIRECTORY_BLACKLIST.includes(dirent.name)) {
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
  connectionId,
  repoLogin,
  repoName,
  repoId,
  loggerArgs,
}: {
  connectionId: string;
  repoLogin: string;
  repoName: string;
  repoId: number;
  loggerArgs: Record<string, string | number>;
}) {
  const localLogger = logger.child(loggerArgs);
  const octokit = await getOctokit(connectionId);

  const { data } = await octokit.rest.repos.get({
    owner: repoLogin,
    repo: repoName,
  });
  const defaultBranch = data.default_branch;

  localLogger.info(
    { defaultBranch, size: data.size },
    "Retrieved repository info"
  );

  // `data.size` is the whole repo size in KB, we use it to filter repos > 10GB download size. There
  // is further filtering by file type + for "extracted size" per file to 1MB.
  if (data.size > 10 * 1024 * 1024) {
    // For now we throw an error, we'll figure out as we go how we want to handle (likely a typed
    // error to return a syncFailed to the user, or increase this limit if we want some largers
    // repositories).
    throw new Error(
      `Repository is too large to sync (size: ${data.size}KB, max: 10GB)`
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

    throw err;
  }

  // Create a temp directory.
  const tempDir = await mkdtemp(join(tmpdir(), "repo-"));

  try {
    const tarPath = resolve(tempDir, "repo.tar.gz");

    localLogger.info({ tempDir, tarPath }, "Starting download of tarball");

    // Save the tarball to the temp directory.
    await pipeline(tarballStream, createWriteStream(tarPath));

    const { size } = await fs.stat(tarPath);

    localLogger.info({ tarSize: size, tarPath }, "Finished tarball download");

    // Extract the tarball.
    await extract({
      file: tarPath,
      cwd: tempDir,
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
      const ext = extname(file).toLowerCase();

      const isWithelisted =
        (EXTENSION_WHITELIST.includes(ext) ||
          FILENAME_WHITELIST.includes(file)) &&
        !SUFFIX_BLACKLIST.some((suffix) => file.endsWith(suffix));

      if (!isWithelisted) {
        continue;
      }

      try {
        const { size } = await fs.stat(file);

        const isUnderLimit = size < 1024 * 1024;

        if (!isUnderLimit) {
          localLogger.info(
            { file, size },
            "File is over the size limit, skipping."
          );
          continue;
        }
      } catch (e) {
        localLogger.info(
          { error: e, file },
          "Caught exception while stating file, skipping."
        );
        continue;
      }

      const path = file
        .substring(tempDir.length + 1)
        .split("/")
        .slice(1, -1);
      const fileName = basename(file);

      const parents = [];
      for (let i = 0; i < path.length; i++) {
        const p = `github-code-${repoId}-dir-${path.slice(0, i + 1).join("/")}`;
        const pathInternalId = `github-code-${repoId}-dir-${blake3(p)
          .toString("hex")
          .substring(0, 16)}`;
        parents.push({
          internalId: pathInternalId,
          dirName: path[i] as string,
          dirPath: path.slice(0, i),
        });
      }

      const documentId = `github-code-${repoId}-file-${blake3(
        `github-code-${repoId}-file-${path.join("/")}/${fileName}`
      )
        .toString("hex")
        .substring(0, 16)}`;

      const parentInternalId =
        parents.length === 0
          ? null
          : (parents[parents.length - 1]?.internalId as string);

      // Files
      files.push({
        fileName,
        filePath: path,
        sourceUrl: `https://github.com/${repoLogin}/${repoName}/blob/${defaultBranch}/${join(
          path.join("/"),
          fileName
        )}`,
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

          const dirParent = parents[i - 1];
          const dirParentInternalId = dirParent ? dirParent.internalId : null;

          directories.push({
            dirName: p.dirName,
            dirPath: p.dirPath,
            sourceUrl: `https://github.com/${repoLogin}/${repoName}/blob/${defaultBranch}/${join(
              p.dirPath.join("/"),
              p.dirName
            )}`,
            internalId: p.internalId,
            parentInternalId: dirParentInternalId,
            parents: parents.slice(0, i).map((p) => p.internalId),
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
    localLogger.info(
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
