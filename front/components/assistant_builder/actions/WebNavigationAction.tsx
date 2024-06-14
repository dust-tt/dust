import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function isActionWebsearchValid(
  action: AssistantBuilderActionConfiguration
) {
  return (
    action.type === "WEB_NAVIGATION" &&
    Object.keys(action.configuration).length === 0
  );
}

export function ActionWebNavigation() {
  return (
    <div>
      This action will perform a web search and return the top results (title,
      link and summary, and page content) to the assistant.
    </div>
  );
}
