import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  getAvailableReasoningEfforts,
  type ModelConfigurationType,
  type ReasoningEffort,
} from "@app/types/assistant/models/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import {
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import isEqual from "lodash/isEqual";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect, useMemo } from "react";
import { useController, useWatch } from "react-hook-form";

const REASONING_EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  none: "No additional reasoning",
  light: "Quick analysis",
  medium: "Balanced reasoning",
  high: "Deep reasoning (slower)",
};

interface ReasoningEffortSubmenuProps {
  models: ModelConfigurationType[];
}

export function ReasoningEffortSubmenu({
  models,
}: ReasoningEffortSubmenuProps) {
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

  const modelConfig = useMemo(
    () =>
      models.find(
        (m) =>
          m.modelId === modelSettings.modelId &&
          m.providerId === modelSettings.providerId
      ),
    [models, modelSettings.modelId, modelSettings.providerId]
  );

  useEffect(() => {
    if (modelConfig) {
      const currentEffort = field.value;
      const availableEfforts = getAvailableReasoningEfforts(
        modelConfig.supportedReasoningEfforts
      );

      if (!availableEfforts.includes(currentEffort)) {
        field.onChange(modelConfig.defaultReasoningEffort);
      }
    }
  }, [modelConfig, field]);

  if (!modelConfig) {
    return null;
  }

  const availableEfforts = getAvailableReasoningEfforts(
    modelConfig.supportedReasoningEfforts
  );

  if (availableEfforts.length === 0 || isEqual(availableEfforts, ["none"])) {
    return null;
  }

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
