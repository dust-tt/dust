import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function hasErrorActionReasoning(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "REASONING" &&
    (!action.configuration.providerId || !action.configuration.modelId)
    ? "Please select a model provider and model."
    : null;
}

export function ActionReasoning() {
  return (
    <div>
      This tool will perform step by step reasoning to solve complex problems.
      Slow but powerful.
    </div>
  );
}
