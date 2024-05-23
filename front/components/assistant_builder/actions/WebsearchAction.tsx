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
      This action will search the web and provide the 8 first results (title,
      link and summary) to the assistant.
    </div>
  );
}
