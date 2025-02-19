import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  GithubCreateIssueConfigurationType,
  GithubCreateIssueErrorEvent,
  GithubCreateIssueParamsEvent,
  GithubCreateIssueSuccessEvent,
  GithubGetPullRequestCommentType,
  GithubGetPullRequestCommitType,
  GithubGetPullRequestConfigurationType,
  GithubGetPullRequestErrorEvent,
  GithubGetPullRequestParamsEvent,
  GithubGetPullRequestReviewType,
  GithubGetPullRequestSuccessEvent,
  ModelId,
  Result,
} from "@dust-tt/types";
import { BaseAction, getOAuthConnectionAccessToken, Ok } from "@dust-tt/types";
import { Octokit } from "octokit";

import {
  DEFAULT_GITHUB_CREATE_ISSUE_ACTION_DESCRIPTION,
  DEFAULT_GITHUB_CREATE_ISSUE_ACTION_NAME,
  DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_DESCRIPTION,
  DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_NAME,
} from "@app/lib/api/assistant/actions/constants";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentGithubCreateIssueAction,
  AgentGithubGetPullRequestAction,
} from "@app/lib/models/assistant/actions/github";
import { PlatformActionsConfigurationResource } from "@app/lib/resources/platform_actions_configuration_resource";
import logger from "@app/logger/logger";

/**
 * GtihubGetPullRequestAction.
 */

export const GITHUB_GET_PULL_REQUEST_ACTION_MAX_COMMITS = 32;

interface GithubGetPullRequestActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
  };
  pullBody: string | null;
  pullCommits: GithubGetPullRequestCommitType[] | null;
  pullComments: GithubGetPullRequestCommentType[] | null;
  pullReviews: GithubGetPullRequestReviewType[] | null;
  pullDiff: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class GithubGetPullRequestAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    owner: string;
    repo: string;
    pullNumber: number;
  };
  readonly pullBody: string | null;
  readonly pullCommits: GithubGetPullRequestCommitType[] | null;
  readonly pullComments: GithubGetPullRequestCommentType[] | null;
  readonly pullReviews: GithubGetPullRequestReviewType[] | null;
  readonly pullDiff: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "github_get_pull_request_action";

  constructor(blob: GithubGetPullRequestActionBlob) {
    super(blob.id, "github_get_pull_request_action");
    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.pullBody = blob.pullBody;
    this.pullCommits = blob.pullCommits;
    this.pullComments = blob.pullComments;
    this.pullReviews = blob.pullReviews;
    this.pullDiff = blob.pullDiff;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name:
        this.functionCallName ?? DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_NAME,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    // TODO(spolu): add PR author and date
    const content =
      `${this.pullBody}\n\n` +
      `COMMITS:\n` +
      `${(this.pullCommits || [])
        .map((c) => `${c.sha} ${c.author}: ${c.message}`)
        .join("\n")}\n\n` +
      `DIFF:\n` +
      `${this.pullDiff}\n\n` +
      `COMMENTS:\n` +
      `${(this.pullComments || [])
        .map((c) => {
          return `${c.author} [${new Date(c.createdAt).toISOString()}]:\n${c.body}`;
        })
        .join("\n")}\n\n` +
      `REVIEWS:\n` +
      `${(this.pullReviews || [])
        .map(
          (r) =>
            `${r.author} [${new Date(r.createdAt).toISOString()}]:\n(${r.state})\n${r.body}\n${(
              r.comments || []
            )
              .map((c) => ` - ${c.path}:${c.line}:\n${c.body}`)
              .join("\n")}`
        )
        .join("\n")}`;

    return {
      role: "function" as const,
      name:
        this.functionCallName ?? DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class GithubGetPullRequestConfigurationServerRunner extends BaseActionConfigurationServerRunner<GithubGetPullRequestConfigurationType> {
  async buildSpecification(
    _auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    return new Ok({
      name,
      description:
        description ?? DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_DESCRIPTION,
      inputs: [
        {
          name: "owner",
          description:
            "The owner of the repository to get the pull request from (account or organization name)",
          type: "string",
        },
        {
          name: "repo",
          description:
            "The name of the repository to get the pull request from",
          type: "string",
        },
        {
          name: "pullNumber",
          description: "The number of the pull request to get",
          type: "number",
        },
      ],
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    | GithubGetPullRequestParamsEvent
    | GithubGetPullRequestSuccessEvent
    | GithubGetPullRequestErrorEvent,
    void
  > {
    const { actionConfiguration } = this;

    const platformActionsConfiguration =
      await PlatformActionsConfigurationResource.findByWorkspaceAndProvider(
        auth,
        {
          provider: "github",
        }
      );

    if (!platformActionsConfiguration) {
      yield {
        type: "github_get_pull_request_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_configuration_error",
          message: `GitHub actions have not been configured for this workspace.`,
        },
      };
      return;
    }

    if (
      !rawInputs.owner ||
      !rawInputs.repo ||
      !rawInputs.pullNumber ||
      typeof rawInputs.owner !== "string" ||
      typeof rawInputs.repo !== "string" ||
      typeof rawInputs.pullNumber !== "number"
    ) {
      yield {
        type: "github_get_pull_request_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_get_pull_request_parameters_generation_error",
          message: `Error generating parameters for GitHub get pull request action.`,
        },
      };
      return;
    }

    const pullNumber = rawInputs.pullNumber as number;
    const owner = rawInputs.owner as string;
    const repo = rawInputs.repo as string;

    // Create the action in database and yield an event
    const action = await AgentGithubGetPullRequestAction.create({
      owner,
      repo,
      pullNumber,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    yield {
      type: "github_get_pull_request_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new GithubGetPullRequestAction({
        id: action.id,
        params: {
          owner,
          repo,
          pullNumber,
        },
        pullBody: null,
        pullCommits: null,
        pullDiff: null,
        pullComments: null,
        pullReviews: null,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
      }),
    };

    const tokRes = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      provider: "github",
      connectionId: platformActionsConfiguration.connectionId,
    });

    if (tokRes.isErr()) {
      yield {
        type: "github_get_pull_request_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_connection_error",
          message: `Error getting connection token for GitHub: ${tokRes.error.message}`,
        },
      };
      return;
    }

    const octokit = new Octokit({ auth: tokRes.value.access_token });

    try {
      const query = `
      query($owner: String!, $repo: String!, $pullNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pullNumber) {
            body
            commits(last: ${GITHUB_GET_PULL_REQUEST_ACTION_MAX_COMMITS}) {
              nodes {
                commit {
                  oid
                  message
                  author {
                    user {
                      login
                    }
                  }
                }
              }
            }
            comments(first: 100) {
              nodes {
                author {
                  login
                }
                body
                createdAt
              }
            }
            reviews(first: 100) {
              nodes {
                author {
                  login
                }
                body
                state
                createdAt
                comments(first: 100) {
                  nodes {
                    body
                    path
                    line
                  }
                }
              }
            }
          }
        }
      }`;

      // Get the PR description and base/head commit
      const pr = (await octokit.graphql(query, {
        owner,
        repo,
        pullNumber,
      })) as {
        repository: {
          pullRequest: {
            body: string;
            commits: {
              nodes: {
                commit: {
                  oid: string;
                  message: string;
                  author: {
                    user: {
                      login: string;
                    };
                  };
                };
              }[];
            };
            comments: {
              nodes: {
                author: {
                  login: string;
                };
                body: string;
                createdAt: string;
              }[];
            };
            reviews: {
              nodes: {
                author: {
                  login: string;
                };
                body: string;
                state: string;
                createdAt: string;
                comments: {
                  nodes: {
                    body: string;
                    path: string;
                    line: number;
                  }[];
                };
              }[];
            };
          };
        };
      };

      const prBody = pr.repository.pullRequest.body;
      const prCommits = pr.repository.pullRequest.commits.nodes.map((n) => {
        return {
          sha: n.commit.oid,
          message: n.commit.message,
          author: n.commit.author.user.login,
        };
      });
      const prComments = pr.repository.pullRequest.comments.nodes.map((n) => {
        return {
          createdAt: new Date(n.createdAt).getTime(),
          author: n.author.login,
          body: n.body,
        };
      });
      const prReviews = pr.repository.pullRequest.reviews.nodes.map((n) => {
        return {
          createdAt: new Date(n.createdAt).getTime(),
          author: n.author.login,
          body: n.body,
          state: n.state,
          comments: n.comments.nodes.map((c) => {
            return {
              body: c.body,
              path: c.path,
              line: c.line,
            };
          }),
        };
      });

      // const formatDiffWithLineNumbers = (diff: string) => {
      //   const lines = diff.split("\n");
      //   let oldLineNum = 0;
      //   let newLineNum = 0;

      //   return lines
      //     .map((line) => {
      //       if (
      //         !line.startsWith("+") &&
      //         !line.startsWith("-") &&
      //         !line.startsWith(" ") &&
      //         !line.startsWith("@")
      //       ) {
      //         return line;
      //       }

      //       if (line.startsWith("@@")) {
      //         // Reset line numbers based on hunk header
      //         const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
      //         if (match) {
      //           oldLineNum = parseInt(match[1]) - 1;
      //           newLineNum = parseInt(match[2]) - 1;
      //         }
      //         return line;
      //       }

      //       if (line.startsWith("-")) {
      //         oldLineNum++;
      //         return `${oldLineNum}: ${line}`;
      //       }
      //       if (line.startsWith("+")) {
      //         newLineNum++;
      //         return `${newLineNum}: ${line}`;
      //       }
      //       oldLineNum++;
      //       newLineNum++;
      //       return `${newLineNum}: ${line}`;
      //     })
      //     .join("\n");
      // };

      // Get the actual diff using REST API (not available in GraphQL)
      const diff = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: {
          format: "diff",
        },
      });

      // @ts-expect-error - data is a string when mediatType.format is `diff` (wrongly typed as
      // their defauilt response type)
      const prDiff = diff.data as string;

      await action.update({
        pullBody: prBody,
        pullCommits: prCommits,
        pullDiff: prDiff,
        pullComments: prComments,
        pullReviews: prReviews,
      });
    } catch (e) {
      yield {
        type: "github_get_pull_request_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_get_pull_request_error",
          message: `Error getting pull request from GitHub`,
        },
      };
      return;
    }

    yield {
      type: "github_get_pull_request_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new GithubGetPullRequestAction({
        id: action.id,
        params: {
          owner: owner,
          repo: repo,
          pullNumber,
        },
        pullBody: action.pullBody,
        pullCommits: action.pullCommits,
        pullDiff: action.pullDiff,
        pullComments: action.pullComments,
        pullReviews: action.pullReviews,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
      }),
    };
  }
}

export async function githubGetPullRequestActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<GithubGetPullRequestAction[]> {
  const models = await AgentGithubGetPullRequestAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new GithubGetPullRequestAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      params: {
        owner: action.owner,
        repo: action.repo,
        pullNumber: action.pullNumber,
      },
      pullBody: action.pullBody,
      pullCommits: action.pullCommits,
      pullDiff: action.pullDiff,
      pullComments: action.pullComments,
      pullReviews: action.pullReviews,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}

/**
 * GtihubCreateIssueAction
 */

interface GithubCreateIssueActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
  };
  issueNumber: number | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class GithubCreateIssueAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
  };
  readonly issueNumber: number | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type = "github_create_issue_action";

  constructor(blob: GithubCreateIssueActionBlob) {
    super(blob.id, "github_create_issue_action");
    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.issueNumber = blob.issueNumber;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_GITHUB_CREATE_ISSUE_ACTION_NAME,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    const content = `Issue created: { number: ${this.issueNumber}}`;

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_GITHUB_CREATE_ISSUE_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

/**
 * Params generation.
 */

export class GithubCreateIssueConfigurationServerRunner extends BaseActionConfigurationServerRunner<GithubCreateIssueConfigurationType> {
  async buildSpecification(
    _auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    return new Ok({
      name,
      description:
        description ?? DEFAULT_GITHUB_CREATE_ISSUE_ACTION_DESCRIPTION,
      inputs: [
        {
          name: "owner",
          description:
            "The owner of the repository (account or organization name)",
          type: "string",
        },
        {
          name: "repo",
          description: "The name of the repository",
          type: "string",
        },
        {
          name: "title",
          description: "The title of the issue",
          type: "string",
        },
        {
          name: "body",
          description: "The contents of the issue",
          type: "string",
        },
      ],
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    | GithubCreateIssueParamsEvent
    | GithubCreateIssueSuccessEvent
    | GithubCreateIssueErrorEvent,
    void
  > {
    const { actionConfiguration } = this;

    const platformActionsConfiguration =
      await PlatformActionsConfigurationResource.findByWorkspaceAndProvider(
        auth,
        {
          provider: "github",
        }
      );

    if (!platformActionsConfiguration) {
      yield {
        type: "github_create_issue_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_configuration_error",
          message: `GitHub actions have not been configured for this workspace.`,
        },
      };
      return;
    }

    if (
      !rawInputs.owner ||
      !rawInputs.repo ||
      !rawInputs.title ||
      !rawInputs.body ||
      typeof rawInputs.owner !== "string" ||
      typeof rawInputs.repo !== "string" ||
      typeof rawInputs.title !== "string" ||
      typeof rawInputs.body !== "string"
    ) {
      yield {
        type: "github_create_issue_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_create_issue_parameters_generation_error",
          message: `Error generating parameters for GitHub create issue action.`,
        },
      };
      return;
    }

    const owner = rawInputs.owner as string;
    const repo = rawInputs.repo as string;
    const title = rawInputs.title as string;
    const body = rawInputs.body as string;

    // Create the action in database and yield an event
    const action = await AgentGithubCreateIssueAction.create({
      owner,
      repo,
      title,
      body,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    yield {
      type: "github_create_issue_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new GithubCreateIssueAction({
        id: action.id,
        params: {
          owner,
          repo,
          title,
          body,
        },
        issueNumber: null,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
      }),
    };

    const tokRes = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      provider: "github",
      connectionId: platformActionsConfiguration.connectionId,
    });

    if (tokRes.isErr()) {
      yield {
        type: "github_create_issue_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_connection_error",
          message: `Error getting connection token for GitHub: ${tokRes.error.message}`,
        },
      };
      return;
    }

    const octokit = new Octokit({ auth: tokRes.value.access_token });

    try {
      const { data: issue } = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        // labels: [], // optional
        // assignees: [], // optional
      });

      await action.update({
        issueNumber: issue.number,
      });
    } catch (e) {
      yield {
        type: "github_create_issue_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "github_create_issue_error",
          message: `Error creating GitHub issue`,
        },
      };
      return;
    }

    yield {
      type: "github_create_issue_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new GithubCreateIssueAction({
        id: action.id,
        params: {
          owner,
          repo,
          title,
          body,
        },
        issueNumber: action.issueNumber,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
      }),
    };
  }
}

export async function githubCreateIssueActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<GithubCreateIssueAction[]> {
  const models = await AgentGithubCreateIssueAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return models.map((action) => {
    return new GithubCreateIssueAction({
      id: action.id,
      agentMessageId: action.agentMessageId,
      params: {
        owner: action.owner,
        repo: action.repo,
        title: action.title,
        body: action.body,
      },
      issueNumber: action.issueNumber,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      step: action.step,
    });
  });
}
