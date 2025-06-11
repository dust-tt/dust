import {
  Button,
  Card,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  InformationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { partition } from "lodash";
import { useMemo } from "react";

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ReasoningModelConfiguration } from "@app/lib/actions/reasoning";
import { useModels } from "@app/lib/swr/models";
import type {
  LightWorkspaceType,
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types";
import {
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
  getProviderDisplayName,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

interface ReasoningModelConfigurationSectionProps {
  owner: LightWorkspaceType;
  selectedReasoningModel: ReasoningModelConfiguration | null;
  onModelSelect: (modelConfig: ReasoningModelConfiguration) => void;
}

const BEST_PERFORMING_REASONING_MODELS_ID = [
  O4_MINI_MODEL_ID,
  O3_MODEL_ID,
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
];

function groupReasoningModelsByPerformance(
  reasoningModels: ModelConfigurationType[]
) {
  const [performingModels, nonPerfomingModels] = partition(
    reasoningModels,
    (model) => {
      if (model.modelId === O4_MINI_MODEL_ID) {
        return model.reasoningEffort === "high";
      }
      return BEST_PERFORMING_REASONING_MODELS_ID.includes(model.modelId);
    }
  );
  return { performingModels, nonPerfomingModels };
}

// Using Map because we don't want to lose the order (reasoningModels are sorted by our preference).
function groupModelsByProvider(reasoningModels: ModelConfigurationType[]) {
  const map = new Map<ModelProviderIdType, ModelConfigurationType[]>();
  for (const model of reasoningModels) {
    const key = model.providerId;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(model);
  }
  return map;
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

  // It should be selected by default, but in case it was not available,
  // use the first one from the list (sorted by preference).
  const selectedReasoningModelConfig = useMemo(
    () =>
      (selectedReasoningModel &&
        reasoningModels.find(
          (m) =>
            m.modelId === selectedReasoningModel.modelId &&
            m.providerId === selectedReasoningModel.providerId
        )) ??
      reasoningModels[0],
    [selectedReasoningModel, reasoningModels]
  );

  const { performingModels, nonPerfomingModels } =
    groupReasoningModelsByPerformance(reasoningModels);

  const modelsGroupedByProvider = groupModelsByProvider(nonPerfomingModels);

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
        There are no reasoning models available on your workspace.
      </ContentMessage>
    );
  }

  return (
    <ConfigurationSectionContainer title="Reasoning Model">
      {isModelsLoading ? (
        <Card size="sm" className="h-36 w-full">
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        </Card>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              label={selectedReasoningModelConfig.displayName}
              variant="outline"
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {performingModels.length > 0 && (
              <>
                <DropdownMenuLabel>
                  Best performing reasoning models
                </DropdownMenuLabel>
                {performingModels.map((model) => (
                  <ReasoningModelDropdownMenuItem
                    key={`${model.modelId}-${model.reasoningEffort ?? ""}`}
                    model={model}
                    onClick={onModelSelect}
                    isDark={isDark}
                  />
                ))}
                <DropdownMenuLabel>Other models</DropdownMenuLabel>
              </>
            )}
            {[...modelsGroupedByProvider.entries()].map(
              ([providerId, models]) => {
                return (
                  <DropdownMenuGroup key={providerId}>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        label={`${getProviderDisplayName(providerId)} models`}
                        icon={getModelProviderLogo(providerId, isDark)}
                      />
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          {models.map((model) => (
                            <ReasoningModelDropdownMenuItem
                              key={`${model.modelId}-${model.reasoningEffort ?? ""}`}
                              model={model}
                              onClick={onModelSelect}
                              isDark={isDark}
                            />
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>
                );
              }
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ConfigurationSectionContainer>
  );
}

function ReasoningModelDropdownMenuItem({
  model,
  onClick,
  isDark,
}: {
  model: ModelConfigurationType;
  onClick: (model: ReasoningModelConfiguration) => void;
  isDark: boolean;
}) {
  return (
    <DropdownMenuItem
      label={model.displayName}
      icon={getModelProviderLogo(model.providerId, isDark)}
      onClick={() =>
        onClick({
          modelId: model.modelId,
          providerId: model.providerId,
          reasoningEffort: model.reasoningEffort ?? null,
          temperature: null,
        })
      }
    />
  );
}
