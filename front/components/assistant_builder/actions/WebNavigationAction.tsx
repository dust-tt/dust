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
      This action will perform a web search and/or browse a page content. It
      will return the top results (title, link and summary) in case of a search,
      and the page content if it browsed the page.
    </div>
  );
}
