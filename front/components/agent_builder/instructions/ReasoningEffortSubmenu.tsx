import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
} from "@dust-tt/sparkle";
import isEqual from "lodash/isEqual";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useEffect, useMemo, useState } from "react";
import { useController, useWatch } from "react-hook-form";

const REASONING_EFFORT_DESCRIPTIONS: Record<ReasoningEffort, string> = {
  none: "No additional reasoning",
  light: "Quick analysis",
  medium: "Balanced reasoning",
  high: "Deep reasoning (slower)",
};

interface ReasoningEffortSubmenuProps {
  models: EnabledModelConfigurationType[];
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

  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  const modelConfig = useMemo(
    () =>
      models.find(
        (m) =>
          m.modelId === modelSettings?.modelId &&
          m.providerId === modelSettings?.providerId
      ),
    [models, modelSettings?.modelId, modelSettings?.providerId]
  );

  useEffect(() => {
    if (modelConfig) {
      const currentEffort = field.value;
      const availableEfforts = getAvailableReasoningEfforts(
        modelConfig.supportedReasoningEfforts
      );

      if (!currentEffort || !availableEfforts.includes(currentEffort)) {
        field.onChange(modelConfig.defaultReasoningEffort);
      }
    }
  }, [modelConfig, field]);

  if (!modelConfig || !modelConfig.isSelectable) {
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

  const effortItems = (
    <>
      <DropdownMenuLabel label="Select reasoning effort" />
      <DropdownMenuRadioGroup value={field.value ?? undefined}>
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
    </>
  );

  if (isMobile) {
    return (
      <>
        <DropdownMenuItem
          label="Custom reasoning effort"
          endComponent={
            <Icon visual={isExpanded ? ChevronDown : ChevronRight} size="xs" />
          }
          onClick={() => setIsExpanded((v) => !v)}
          onSelect={(e) => e.preventDefault()}
        />
        {isExpanded && effortItems}
      </>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger label="Custom reasoning effort" />
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          {effortItems}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
