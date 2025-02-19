import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function hasErrorActionGithub(
  action: AssistantBuilderActionConfiguration
): string | null {
  return ["GITHUB_GET_PULL_REQUEST", "GITHUB_CREATE_ISSUE"].includes(
    action.type
  ) && Object.keys(action.configuration).length === 0
    ? null
    : "Invalid configuration.";
}

export function ActionGithubGetPullRequest() {
  return (
    <div>
      This tool will retrieve the details of a pull request from a GitHub
      (description, diff, comments and reviews).
    </div>
  );
}

export function ActionGithubCreateIssue() {
  return <div>This tool will create a new issue on GitHub.</div>;
}
