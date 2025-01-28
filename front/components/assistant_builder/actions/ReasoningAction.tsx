import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function hasErrorActionReasoning(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "REASONING" &&
    Object.keys(action.configuration).length === 0
    ? null
    : "Invalid configuration.";
}

export function ActionReasoning() {
  return (
    <div>
      This tool will perform complex step by step reasoning to solve problems
      that require deep analysis. Slow but powerful.
    </div>
  );
}
