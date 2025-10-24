import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

import type { AgentBuilderState } from "@app/components/assistant_builder/types";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { asDisplayName, REASONING_EFFORT_IDS } from "@app/types";

interface ReasoningEffortSubmenuProps {
  generationSettings: AgentBuilderState["generationSettings"];
  setGenerationSettings: (
    settings: AgentBuilderState["generationSettings"]
  ) => void;
}

export function ReasoningEffortSubmenu({
  generationSettings,
  setGenerationSettings,
}: ReasoningEffortSubmenuProps) {
  const { modelSettings, reasoningEffort } = generationSettings;

  const modelConfig = useMemo(() => {
    if (!modelSettings) {
      return null;
    }
    return getSupportedModelConfig(modelSettings);
  }, [modelSettings]);

  useEffect(() => {
    if (modelConfig && reasoningEffort) {
      const reasoningEffortIndex =
        REASONING_EFFORT_IDS.indexOf(reasoningEffort);
      const minIndex = REASONING_EFFORT_IDS.indexOf(
        modelConfig.minimumReasoningEffort
      );
      const maxIndex = REASONING_EFFORT_IDS.indexOf(
        modelConfig.maximumReasoningEffort
      );

      if (reasoningEffortIndex < minIndex || reasoningEffortIndex > maxIndex) {
        setGenerationSettings({
          ...generationSettings,
          reasoningEffort: modelConfig.defaultReasoningEffort,
        });
      }
    }
  }, [modelConfig, reasoningEffort, generationSettings, setGenerationSettings]);

  if (!modelConfig) {
    return null;
  }

  const minIndex = REASONING_EFFORT_IDS.indexOf(
    modelConfig.minimumReasoningEffort
  );
  const maxIndex = REASONING_EFFORT_IDS.indexOf(
    modelConfig.maximumReasoningEffort
  );
  const availableOptions = REASONING_EFFORT_IDS.slice(minIndex, maxIndex + 1);

  if (availableOptions.length <= 1) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Reasoning effort" />
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={reasoningEffort}>
          {availableOptions.map((effort) => (
            <DropdownMenuRadioItem
              key={effort}
              value={effort}
              label={asDisplayName(effort)}
              onClick={() => {
                setGenerationSettings({
                  ...generationSettings,
                  reasoningEffort: effort,
                });
              }}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
