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
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/mcp/sections/ConfigurationSectionContainer";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useModels } from "@app/lib/swr/models";
import type {
  LightWorkspaceType,
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningModelConfigurationType,
} from "@app/types";
import {
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
  getProviderDisplayName,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

interface ReasoningModelSectionProps {
  owner: LightWorkspaceType;
}

const BEST_PERFORMING_REASONING_MODELS_ID = [
  O4_MINI_MODEL_ID,
  O3_MODEL_ID,
  GEMINI_2_5_PRO_PREVIEW_MODEL_ID,
];

function groupReasoningModelsByPerformance(
  reasoningModels: ModelConfigurationType[]
) {
  const [performingModels, nonPerformingModels] = partition(
    reasoningModels,
    (model) => {
      return BEST_PERFORMING_REASONING_MODELS_ID.includes(model.modelId);
    }
  );
  return { performingModels, nonPerformingModels };
}

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

export function ReasoningModelSection({ owner }: ReasoningModelSectionProps) {
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.reasoningModel"
  >({
    name: "configuration.reasoningModel",
  });

  const { reasoningModels, isModelsLoading, isModelsError } = useModels({
    owner,
  });
  const { isDark } = useTheme();

  // It should be selected by default, but in case it was not available,
  // use the first one from the list (sorted by preference).
  const selectedReasoningModelConfig = useMemo(
    () =>
      (field.value &&
        reasoningModels.find(
          (m) =>
            m.modelId === field.value.modelId &&
            m.providerId === field.value.providerId
        )) ??
      reasoningModels[0],
    [field.value, reasoningModels]
  );

  const { performingModels, nonPerformingModels } =
    groupReasoningModelsByPerformance(reasoningModels);

  const modelsGroupedByProvider = groupModelsByProvider(nonPerformingModels);

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
    <ConfigurationSectionContainer
      title="Reasoning Model"
      error={fieldState.error?.message}
    >
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
                      key={model.modelId}
                      model={model}
                      onClick={(model) => field.onChange(model)}
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
                                key={model.modelId}
                                model={model}
                                onClick={(model) => field.onChange(model)}
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
          <p className="mt-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
            {selectedReasoningModelConfig.description}
          </p>
          {fieldState.error && (
            <p className="text-sm text-red-500">{fieldState.error.message}</p>
          )}
        </>
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
  onClick: (model: ReasoningModelConfigurationType) => void;
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
          temperature: null,
          reasoningEffort: null,
        })
      }
    />
  );
}
