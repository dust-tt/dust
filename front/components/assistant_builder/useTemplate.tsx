import _ from "lodash";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { getDefaultAssistantState } from "@app/components/assistant_builder/types";
import type { FetchAssistantTemplateResponse } from "@app/pages/api/w/[wId]/assistant/builder/templates/[tId]";

export function useTemplate(
  initialTemplate: FetchAssistantTemplateResponse | null
) {
  const [template, setTemplate] =
    useState<FetchAssistantTemplateResponse | null>(initialTemplate);
  const [instructionsResetAt, setInstructionsResetAt] = useState<number | null>(
    null
  );
  const router = useRouter();

  const removeTemplate = useCallback(async () => {
    setTemplate(null);
    await router.replace(
      { pathname: router.pathname, query: _.omit(router.query, "templateId") },
      undefined,
      { shallow: true }
    );
  }, [router]);

  const resetToTemplateInstructions = useCallback(
    (
      setBuilderState: React.Dispatch<
        React.SetStateAction<AssistantBuilderState>
      >
    ) => {
      if (template === null) {
        return;
      }
      setInstructionsResetAt(Date.now()); // Update the reset timestamp
      setBuilderState((builderState) => ({
        ...builderState,
        instructions: template.presetInstructions,
      }));
    },
    [template]
  );

  const resetToTemplateActions = useCallback(
    (
      setBuilderState: React.Dispatch<
        React.SetStateAction<AssistantBuilderState>
      >
    ) => {
      if (template === null) {
        return;
      }
      const defaultAssistantState = getDefaultAssistantState();
      setBuilderState((builderState) => {
        const newState = {
          ...builderState,
          actions: defaultAssistantState.actions,
        };
        return newState;
      });
    },
    [template]
  );

  return {
    template,
    instructionsResetAt,
    removeTemplate,
    resetToTemplateInstructions,
    resetToTemplateActions,
  };
}
