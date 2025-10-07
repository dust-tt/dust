import {
  Button,
  Card,
  ContentMessage,
  ContextItem,
  InformationCircleIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { Icon } from "@dust-tt/sparkle";
import { PencilIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useModels } from "@app/lib/swr/models";
import type { ModelConfigurationType } from "@app/types";

interface ModelSelectionListProps {
  models: ModelConfigurationType[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onModelSelect: (model: ModelConfigurationType) => void;
  isDark: boolean;
}

function ModelSelectionList({
  models,
  searchQuery,
  setSearchQuery,
  onModelSelect,
  isDark,
}: ModelSelectionListProps) {
  const filteredModels = models.filter((model) =>
    model.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <SearchInput
        name="search"
        placeholder="Search models"
        value={searchQuery}
        onChange={setSearchQuery}
      />
      <div className="mt-1">
        {filteredModels.map((model) => {
          const LogoComponent = getModelProviderLogo(model.providerId, isDark);
          return (
            <ContextItem
              key={model.modelId}
              title={model.displayName}
              visual={
                LogoComponent ? <Icon visual={LogoComponent} size="lg" /> : null
              }
              onClick={() => onModelSelect(model)}
            >
              <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {model.description || "No description available"}
              </div>
            </ContextItem>
          );
        })}
      </div>
    </>
  );
}

interface ModelMessageProps {
  title: string;
  children: string;
}

function ModelMessage({ title, children }: ModelMessageProps) {
  return (
    <ContentMessage
      title={title}
      icon={InformationCircleIcon}
      variant="warning"
      size="sm"
    >
      {children}
    </ContentMessage>
  );
}

export function ReasoningModelSection() {
  const { owner } = useAgentBuilderContext();
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
  const [searchQuery, setSearchQuery] = useState("");

  const handleRowClick = (model: ModelConfigurationType) => {
    field.onChange({
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: null,
      reasoningEffort: null,
    });
  };

  const handleEditClick = () => {
    field.onChange(null);
  };

  const selectedReasoningModelConfig = useMemo(
    () =>
      field.value &&
      reasoningModels.find(
        (m) =>
          m.modelId === field.value.modelId &&
          m.providerId === field.value.providerId
      ),
    [field.value, reasoningModels]
  );

  const shouldShowList =
    !isModelsError && reasoningModels.length > 0 && !field.value;

  let messageProps: { title: string; children: string };
  if (isModelsError) {
    messageProps = {
      title: "Error loading models",
      children:
        "Failed to load available reasoning models. Please try again later.",
    };
  } else if (reasoningModels.length === 0) {
    messageProps = {
      title: "No reasoning model available",
      children: "There are no reasoning models available on your workspace.",
    };
  } else {
    messageProps = {
      title: "The model selected is not available to you",
      children: `The reasoning model selected is not available to you. Please select another model from the list.`,
    };
  }

  return (
    <ConfigurationSectionContainer
      title="Reasoning Model"
      error={fieldState.error?.message}
    >
      {isModelsLoading && (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      )}

      {!isModelsLoading && shouldShowList && (
        <ModelSelectionList
          models={reasoningModels}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onModelSelect={handleRowClick}
          isDark={isDark}
        />
      )}

      {!isModelsLoading && !shouldShowList && selectedReasoningModelConfig && (
        <Card size="sm" className="w-full">
          <div className="flex w-full">
            <div className="flex w-full flex-grow flex-col gap-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  {(() => {
                    const LogoComponent = getModelProviderLogo(
                      selectedReasoningModelConfig.providerId,
                      isDark
                    );
                    return LogoComponent ? (
                      <div className="flex h-8 w-8 items-center justify-center">
                        <Icon visual={LogoComponent} size="lg" />
                      </div>
                    ) : null;
                  })()}
                  <div className="text-md font-medium">
                    {selectedReasoningModelConfig.displayName}
                  </div>
                </div>
              </div>
              <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground dark:text-muted-foreground-night">
                {selectedReasoningModelConfig.description ||
                  "No description available"}
              </div>
            </div>
            <div className="ml-4 self-start">
              <Button
                variant="outline"
                size="sm"
                icon={PencilIcon}
                label="Edit selection"
                onClick={handleEditClick}
              />
            </div>
          </div>
        </Card>
      )}

      {!isModelsLoading && !shouldShowList && !selectedReasoningModelConfig && (
        <ModelMessage {...messageProps} />
      )}
    </ConfigurationSectionContainer>
  );
}
