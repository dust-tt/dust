import { useMemo } from "react";

import type {
  AssistantBuilderActionState,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";

export function getDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderActionState | undefined {
  return builderState.actions[0];
}

export function useDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderActionState | undefined {
  return useMemo(() => builderState.actions[0], [builderState.actions]);
}
