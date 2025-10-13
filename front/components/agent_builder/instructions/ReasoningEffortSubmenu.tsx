import {
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import React, { useEffect } from "react";
import { useController, useWatch } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { AgentReasoningEffort } from "@app/types";
import { asDisplayName } from "@app/types";

const REASONING_EFFORT_DESCRIPTIONS: Record<AgentReasoningEffort, string> = {
  none: "No additional reasoning",
  light: "Quick analysis",
  medium: "Balanced reasoning",
  high: "Deep reasoning (slower)",
};

export function ReasoningEffortSubmenu() {
  const modelSettings = useWatch<
    AgentBuilderFormData,
    "generationSettings.modelSettings"
  >({
    name: "generationSettings.modelSettings",
  });

  const { field } = useController<
    AgentBuilderFormData,
    "generationSettings.reasoningEffort"
  >({
    name: "generationSettings.reasoningEffort",
  });

  const modelConfig = getSupportedModelConfig({
    modelId: modelSettings.modelId,
    providerId: modelSettings.providerId,
  });

  useEffect(() => {
    if (modelConfig) {
      const currentEffort = field.value;
      const availableEfforts = getAvailableReasoningEfforts(
        modelConfig.minimumReasoningEffort,
        modelConfig.maximumReasoningEffort
      );

      if (!availableEfforts.includes(currentEffort)) {
        field.onChange(modelConfig.defaultReasoningEffort);
      }
    }
  }, [modelConfig, field]);

  if (!modelConfig) {
    return null;
  }

  if (
    modelConfig.minimumReasoningEffort === "none" &&
    modelConfig.maximumReasoningEffort === "none"
  ) {
    return null;
  }

  const availableEfforts = getAvailableReasoningEfforts(
    modelConfig.minimumReasoningEffort,
    modelConfig.maximumReasoningEffort
  );

  if (availableEfforts.length <= 1) {
    return <></>;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Reasoning effort" />
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          <DropdownMenuLabel label="Select reasoning effort" />
          <DropdownMenuRadioGroup value={field.value}>
            {availableEfforts.map((effort) => (
              <DropdownMenuRadioItem
                key={effort}
                value={effort}
                label={asDisplayName(effort)}
                description={REASONING_EFFORT_DESCRIPTIONS[effort]}
                onClick={() => field.onChange(effort)}
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}

function getAvailableReasoningEfforts(
  min: AgentReasoningEffort,
  max: AgentReasoningEffort
): AgentReasoningEffort[] {
  const allEfforts: AgentReasoningEffort[] = [
    "none",
    "light",
    "medium",
    "high",
  ];
  const minIndex = allEfforts.indexOf(min);
  const maxIndex = allEfforts.indexOf(max);

  if (minIndex === -1 || maxIndex === -1 || minIndex > maxIndex) {
    return [];
  }

  return allEfforts.slice(minIndex, maxIndex + 1);
}
