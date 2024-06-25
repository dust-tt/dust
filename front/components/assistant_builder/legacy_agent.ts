import type { AssistantBuilderState } from "@app/components/assistant_builder/types";

export function isLegacyAssistantBuilderConfiguration(
  builderState: AssistantBuilderState
): boolean {
  return (
    builderState.actions.length === 1 && !builderState.actions[0].description
  );
}
