import { createAppAuth } from "@octokit/auth-app";
import { hash as blake3 } from "blake3";
import { isLeft } from "fp-ts/lib/Either";
import { createWriteStream } from "fs";
import { mkdtemp, readdir, rm } from "fs/promises";
import fs from "fs-extra";
import * as reporter from "io-ts-reporters";
import { Octokit } from "octokit";
import { tmpdir } from "os";
import { basename, extname, join, resolve } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { extract } from "tar";

import {
  DiscussionCommentNode,
  DiscussionNode,
  ErrorPayloadSchema,
  GetDiscussionCommentRepliesPayloadSchema,
  GetDiscussionCommentsPayloadSchema,
  GetDiscussionPayloadSchema,
  GetRepoDiscussionsPayloadSchema,
} from "@connectors/connectors/github/lib/github_graphql";
import logger from "@connectors/logger/logger";

const API_PAGE_SIZE = 100;

type GithubOrg = {
  id: number;
  login: string;
};

type GithubRepo = {
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

const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH } = process.env;

let _githubAppPrivateKeyCache: string | null = null;

export async function getGithubAppPrivateKey(): Promise<string> {
  if (_githubAppPrivateKeyCache) {
    return _githubAppPrivateKeyCache;
  }

  if (!GITHUB_APP_PRIVATE_KEY_PATH) {
    throw new Error("GITHUB_APP_PRIVATE_KEY_PATH not set");
  }

  const privateKey = await fs.readFile(GITHUB_APP_PRIVATE_KEY_PATH, "utf8");
  _githubAppPrivateKeyCache = privateKey;
  return privateKey;
}

export async function validateInstallationId(
  installationId: string
): Promise<boolean> {
  const octokit = await getOctokit(installationId);

  try {
    await octokit.rest.apps.getAuthenticated();
  } catch (e) {
    logger.error({ error: e }, "Error validating github installation id");
    return false;
  }

  return true;
}

export async function getReposPage(
  installationId: string,
  page: number
): Promise<GithubRepo[]> {
  const octokit = await getOctokit(installationId);

  return (
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
  }));
}

export async function getRepo(
  installationId: string,
  repoId: number
): Promise<GithubRepo> {
  const octokit = await getOctokit(installationId);

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
  installationId: string,
  repoName: string,
  login: string,
  page: number
): Promise<GithubIssue[]> {
  const octokit = await getOctokit(installationId);

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
  installationId: string,
  repoName: string,
  login: string,
  issueNumber: number
): Promise<GithubIssue> {
  const octokit = await getOctokit(installationId);

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
}

export async function getIssueCommentsPage(
  installationId: string,
  repoName: string,
  login: string,
  issueNumber: number,
  page: number
): Promise<GithubIssueComment[]> {
  const octokit = await getOctokit(installationId);

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
  installationId: string,
  repoName: string,
  login: string,
  cursor: string | null = null
): Promise<{ cursor: string | null; discussions: DiscussionNode[] }> {
  const octokit = await getOctokit(installationId);
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
  installationId: string,
  repoName: string,
  login: string,
  discussionNumber: number,
  cursor: string | null = null
): Promise<{ cursor: string | null; comments: DiscussionCommentNode[] }> {
  const octokit = await getOctokit(installationId);
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
  installationId: string,
  nodeID: string,
  cursor: string | null = null
): Promise<{ cursor: string | null; comments: DiscussionCommentNode[] }> {
  const octokit = await getOctokit(installationId);

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
      nodeID,
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
  installationId: string,
  repoName: string,
  login: string,
  discussionNumber: number
): Promise<DiscussionNode> {
  const octokit = await getOctokit(installationId);

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

export async function getOctokit(installationId: string): Promise<Octokit> {
  if (!GITHUB_APP_ID) {
    throw new Error("GITHUB_APP_ID not set");
  }
  const privateKey = await getGithubAppPrivateKey();

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: privateKey,
      installationId: installationId,
    },
  });
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
];

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
  installationId,
  repoLogin,
  repoName,
  repoId,
}: {
  installationId: string;
  repoLogin: string;
  repoName: string;
  repoId: number;
}) {
  const octokit = await getOctokit(installationId);

  const { data } = await octokit.rest.repos.get({
    owner: repoLogin,
    repo: repoName,
  });
  const defaultBranch = data.default_branch;

  octokit.request.defaults({
    request: {
      parseSuccessResponseBody: false,
    },
  });

  // `data.size` is the whole repo size in KB, we use it to filter repos > 2GB download size. There
  // is further filtering by file type + for "extracted size" per file to 1MB.
  if (data.size > 2 * 1024 * 1024) {
    // For now we throw an error, we'll figure out as we go how we want to handle (likely a typed
    // error to return a syncFailed to the user, or increase this limit if we want some largers
    // repositories).
    throw new Error(
      `Repository is too large to sync (size: ${data.size}KB, max: 2GB)`
    );
  }

  const { data: tarballStream } = (await octokit.request(
    "GET /repos/{owner}/{repo}/tarball/{ref}",
    {
      owner: repoLogin,
      repo: repoName,
      ref: defaultBranch,
      request: {
        parseSuccessResponseBody: false,
      },
    }
  )) as { data: Readable };

  // Create a temp directory.
  const tempDir = await mkdtemp(join(tmpdir(), "repo-"));

  try {
    const tarPath = resolve(tempDir, "repo.tar.gz");

    // Save the tarball to the temp directory.
    await pipeline(tarballStream, createWriteStream(tarPath));

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
      // get file extension
      const ext = extname(file).toLowerCase();
      // get file size
      const { size } = await fs.stat(file);

      const isWithelisted =
        EXTENSION_WHITELIST.includes(ext) || FILENAME_WHITELIST.includes(file);

      const isUnderLimit = size < 1024 * 1024;

      if (isWithelisted && isUnderLimit) {
        const path = file
          .substring(tempDir.length + 1)
          .split("/")
          .slice(1, -1);
        const fileName = basename(file);

        const pathInternalIds = [];

        for (let i = 0; i < path.length; i++) {
          const p = `github-code-${repoId}-dir-${path
            .slice(0, i + 1)
            .join("/")}`;
          pathInternalIds.push(
            `github-code-${repoId}-dir-${blake3(p)
              .toString("hex")
              .substring(0, 16)}`
          );
        }

        const documentId = `github-code-${repoId}-file-${blake3(
          `github-code-${repoId}-file-${path.join("/")}/${fileName}`
        )
          .toString("hex")
          .substring(0, 16)}`;

        const parentInternalId =
          pathInternalIds.length === 0
            ? null
            : (pathInternalIds[pathInternalIds.length - 1] as string);

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
          parents: pathInternalIds,
          localFilePath: file,
        });

        // Directories
        if (parentInternalId && !seenDirs[parentInternalId]) {
          seenDirs[parentInternalId] = true;

          const dirName = path[path.length - 1] || "";
          const dirPath = path.slice(0, -1);
          const internalId = parentInternalId;
          const dirParentInternalId =
            pathInternalIds.length === 2
              ? null
              : (pathInternalIds[pathInternalIds.length - 2] as string);

          directories.push({
            dirName,
            dirPath,
            sourceUrl: `https://github.com/${repoLogin}/${repoName}/blob/${defaultBranch}/${join(
              dirPath.join("/"),
              dirName
            )}`,
            internalId,
            parentInternalId: dirParentInternalId,
            parents: pathInternalIds.slice(0, -1),
          });
        }
      }
    }

    return {
      tempDir,
      files,
      directories,
    };
  } catch (e) {
    await cleanUpProcessRepository(tempDir);
    throw e;
  }
}

export async function cleanUpProcessRepository(tempDir: string) {
  // Delete the temp directory.
  await rm(tempDir, { recursive: true });
}
