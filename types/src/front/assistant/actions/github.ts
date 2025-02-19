import { BaseAction } from "../../../front/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";

/**
 * GithubGetPullRequestActionType
 */

export type GithubGetPullRequestCommitType = {
  sha: string;
  author: string;
  message: string;
};

export type GithubGetPullRequestCommentType = {
  createdAt: number;
  author: string;
  body: string;
};

export type GithubGetPullRequestReviewType = {
  createdAt: number;
  author: string;
  body: string;
  state: string;
  comments: {
    body: string;
    path: string;
    line: number;
  }[];
};

export type GithubGetPullRequestConfigurationType = {
  id: ModelId;
  sId: string;

  type: "github_get_pull_request_configuration";

  name: string;
  description: string | null;
};

export interface GithubGetPullRequestActionType extends BaseAction {
  agentMessageId: ModelId;
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
  };
  pullBody: string | null;
  pullCommits: GithubGetPullRequestCommitType[] | null;
  pullDiff: string | null;
  pullComments: GithubGetPullRequestCommentType[] | null;
  pullReviews: GithubGetPullRequestReviewType[] | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "github_get_pull_request_action";
}

/**
 * GithubGetPullRequest Action Events
 */

// Event sent before running the action with the finalized params to be used.
export type GithubGetPullRequestParamsEvent = {
  type: "github_get_pull_request_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: GithubGetPullRequestActionType;
};

export type GithubGetPullRequestSuccessEvent = {
  type: "github_get_pull_request_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: GithubGetPullRequestActionType;
};

export type GithubGetPullRequestErrorEvent = {
  type: "github_get_pull_request_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

/**
 * GithubCreateIssueActionType
 */

export type GithubCreateIssueConfigurationType = {
  id: ModelId;
  sId: string;

  type: "github_create_issue_configuration";

  name: string;
  description: string | null;
};

export interface GithubCreateIssueActionType extends BaseAction {
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
  type: "github_create_issue_action";
}

/**
 * GithubCreateIssue Action Events
 */

// Event sent before running the action with the finalized params to be used.
export type GithubCreateIssueParamsEvent = {
  type: "github_create_issue_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: GithubCreateIssueActionType;
};

export type GithubCreateIssueSuccessEvent = {
  type: "github_create_issue_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: GithubCreateIssueActionType;
};

export type GithubCreateIssueErrorEvent = {
  type: "github_create_issue_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};
