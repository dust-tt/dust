import { useMemo } from "react";

import type {
  AssistantBuilderMCPOrVizState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";

export function getDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderMCPOrVizState | undefined {
  return builderState.actions[0];
}

export function useDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderMCPOrVizState | undefined {
  return useMemo(() => builderState.actions[0], [builderState.actions]);
}
