import {
  Button,
  Card,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
} from "@dust-tt/sparkle";
import React from "react";

import { useModels } from "@app/lib/swr/models";
import type { LightWorkspaceType, ModelConfigurationType } from "@app/types";

interface ReasoningModelConfigurationSectionProps {
  owner: LightWorkspaceType;
  selectedReasoningModel: ModelConfigurationType | null;
  onModelSelect: (modelConfig: ModelConfigurationType) => void;
}

export function ReasoningModelConfigurationSection({
  owner,
  selectedReasoningModel,
  onModelSelect,
}: ReasoningModelConfigurationSectionProps) {
  const { reasoningModels } = useModels({ owner });

  if (reasoningModels.length === 0) {
    return (
      <ContentMessage
        title="No reasoning model available"
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        There are no reasoning model available on your workspace.
      </ContentMessage>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex-grow pt-4 text-sm font-semibold text-foreground dark:text-foreground-night">
        Reasoning Model
      </div>

      <Card size="sm" className="h-36 w-full">
        <div className="flex h-full w-full items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {selectedReasoningModel ? (
                <Button
                  label={selectedReasoningModel.displayName}
                  variant="outline"
                  size="sm"
                  isSelect
                />
              ) : (
                <Button
                  label="Select a reasoning model"
                  variant="outline"
                  size="sm"
                  isSelect
                />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {reasoningModels.map((model) => (
                <DropdownMenuItem
                  key={`${model.modelId}-${model.providerId}-${model.reasoningEffort ?? ""}`}
                  label={model.displayName}
                  onClick={() => onModelSelect(model)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    </div>
  );
}
