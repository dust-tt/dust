import {
  Button,
  Card,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
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
  const { reasoningModels, isModelsLoading, isModelsError } = useModels({
    owner,
  });
  const { isDark } = useTheme();

  const selectedReasoningModelConfig = useMemo(
    () =>
      selectedReasoningModel &&
      reasoningModels.find(
        (m) =>
          m.modelId === selectedReasoningModel.modelId &&
          m.providerId === selectedReasoningModel.providerId &&
          (m.reasoningEffort ?? null) ===
            (selectedReasoningModel.reasoningEffort ?? null)
      ),
    [selectedReasoningModel, reasoningModels]
  );

  if (isModelsError) {
    return (
      <ContentMessage
        title="Error loading models"
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        Failed to load available reasoning models. Please try again later.
      </ContentMessage>
    );
  }

  if (!isModelsLoading && reasoningModels.length === 0) {
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

      {isModelsLoading ? (
        <Card size="sm" className="h-36 w-full">
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        </Card>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={
                  selectedReasoningModelConfig?.displayName ??
                  "Select a reasoning model"
                }
                icon={
                  selectedReasoningModelConfig?.providerId
                    ? getModelProviderLogo(
                        selectedReasoningModelConfig?.providerId,
                        isDark
                      )
                    : undefined
                }
                variant="outline"
                size="sm"
                isSelect
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-xl">
              {reasoningModels.map((model) => (
                <DropdownMenuItem
                  key={`${model.modelId}-${model.providerId}-${model.reasoningEffort ?? ""}`}
                  label={model.displayName}
                  icon={getModelProviderLogo(model.providerId, isDark)}
                  description={model.reasoningDescription || model.description}
                  onClick={() =>
                    onModelSelect({
                      modelId: model.modelId,
                      providerId: model.providerId,
                      reasoningEffort: model.reasoningEffort ?? null,
                      temperature: null,
                    })
                  }
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedReasoningModelConfig?.reasoningDescription && (
            <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
              {selectedReasoningModelConfig.reasoningDescription}
            </p>
          )}
        </>
      )}
    </div>
  );
}
