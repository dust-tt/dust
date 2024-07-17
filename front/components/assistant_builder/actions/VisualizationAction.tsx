import type { AssistantBuilderActionConfiguration } from "@app/components/assistant_builder/types";

export function hasErrorActionVisualization(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "VISUALIZATION" &&
    Object.keys(action.configuration).length === 0
    ? null
    : "Invalid configuration.";
}

export function ActionVisualization() {
  return (
    <div>
      This tool generates dynamic graphs and charts to help you visualize and
      understand your data. Customize visual outputs to explore trends and
      patterns effectively.
    </div>
  );
}
