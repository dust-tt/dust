import { BaseAction } from "../../../front/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";

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
  pullCommits:
    | {
        sha: string;
        message: string;
        author: string;
      }[]
    | null;
  pullDiff: string | null;
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
