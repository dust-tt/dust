import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import { rm } from "fs/promises";
import * as reporter from "io-ts-reporters";
import { Octokit, RequestError } from "octokit";
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici";
import { fetch as undiciFetch, ProxyAgent } from "undici";

import {
  isBadCredentials,
  isGithubIssueWasDeletedError,
  isGithubIssueWasDisabledError,
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
import { getIssueLabels } from "@connectors/connectors/github/lib/utils";
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
      isGithubRequestErrorNotFound(err) ||
      isGithubIssueWasDeletedError(err) ||
      isGithubIssueWasDisabledError(err)
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

export async function cleanUpProcessRepository(tempDir: string) {
  // Delete the temp directory.
  await rm(tempDir, { recursive: true });
}
