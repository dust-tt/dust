import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function isActionWebsearchValid(
  action: AssistantBuilderActionConfiguration
) {
  return (
    action.type === "WEBSEARCH" && Object.keys(action.configuration).length > 0
  );
}

export function ActionWebsearch() {
  return (
    <div>
      This action will perform a web search and return the top results (title,
      link and summary) to the assistant.
    </div>
  );
}
