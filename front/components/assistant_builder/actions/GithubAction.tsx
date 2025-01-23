import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function hasErrorActionGithub(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "GITHUB_GET_PULL_REQUEST" &&
    Object.keys(action.configuration).length === 0
    ? null
    : "Invalid configuration.";
}

export function ActionGithubGetPullRequest() {
  return (
    <div>
      This tool will perform a web search and/or browse a page content. It will
      return the top results (title, link and summary) in case of a search, and
      the page content if it browsed the page.
    </div>
  );
}
