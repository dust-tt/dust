import { useMemo } from "react";

import type {
  AssistantBuilderMCPConfigurationWithId,
  AssistantBuilderState,
} from "@app/components/assistant_builder/types";

export function getDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderMCPConfigurationWithId | undefined {
  return builderState.actions[0];
}

export function useDeprecatedDefaultSingleAction(
  builderState: AssistantBuilderState
): AssistantBuilderMCPConfigurationWithId | undefined {
  return useMemo(() => builderState.actions[0], [builderState.actions]);
}
