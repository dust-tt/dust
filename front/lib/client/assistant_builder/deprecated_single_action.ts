import type { AgentActionType } from "@dust-tt/types";
import { useMemo } from "react";

import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";

export function getDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderActionConfiguration | undefined {
  return builderState.actions[0];
}

export function useDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderActionConfiguration | undefined {
  return useMemo(() => builderState.actions[0], [builderState.actions]);
}

export function getDeprecatedSingleAction(
  actions: AgentActionType[]
): AgentActionType | null {
  if (actions.length === 1) {
    return actions[0];
  } else {
    return null;
  }
}
