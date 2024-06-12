import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function isActionBrowseValid(
  action: AssistantBuilderActionConfiguration
) {
  return (
    action.type === "BROWSE" && Object.keys(action.configuration).length === 0
  );
}

export function ActionBrowse() {
  return <div>This action will browse and get the content of a page.</div>;
}
