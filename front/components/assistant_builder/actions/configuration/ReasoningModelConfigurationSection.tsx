import {
  Card,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";
import React from "react";

import {
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ReasoningModelConfiguration } from "@app/lib/actions/reasoning";
import { useModels } from "@app/lib/swr/models";
import type { LightWorkspaceType } from "@app/types";

interface ReasoningModelConfigurationSectionProps {
  owner: LightWorkspaceType;
  selectedReasoningModel: ReasoningModelConfiguration | null;
  onModelSelect: (modelConfig: ReasoningModelConfiguration) => void;
}

export function ReasoningModelConfigurationSection({
  owner,
  selectedReasoningModel,
  onModelSelect,
}: ReasoningModelConfigurationSectionProps) {
  const { reasoningModels } = useModels({ owner });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex-grow pt-4 text-sm font-semibold text-foreground dark:text-foreground-night">
        Reasoning Model
      </div>

      <Card size="sm" className="h-36 w-full">
        <div className="flex h-full w-full items-center justify-center">
          {(reasoningModels?.length ?? 0) > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                label="Reasoning model"
                className="mt-1"
              />
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={`${selectedReasoningModel?.modelId}-${selectedReasoningModel?.providerId}-${selectedReasoningModel?.reasoningEffort ?? ""}`}
                >
                  {(reasoningModels ?? []).map((model) => (
                    <DropdownMenuRadioItem
                      key={`${model.modelId}-${model.providerId}-${model.reasoningEffort ?? ""}`}
                      value={`${model.modelId}-${model.providerId}-${model.reasoningEffort ?? ""}`}
                      label={model.displayName}
                      onClick={() =>
                        onModelSelect({
                          modelId: model.modelId,
                          providerId: model.providerId,
                          reasoningEffort: model.reasoningEffort ?? null,
                          name: DEFAULT_REASONING_ACTION_NAME,
                          description: DEFAULT_REASONING_ACTION_DESCRIPTION,
                        })
                      }
                    />
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </div>
      </Card>
    </div>
  );
}
