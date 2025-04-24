import {
  Avatar,
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

import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
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
  const { reasoningModels, isModelsLoading } = useModels({ owner });
  const { isDark } = useTheme();

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

      {isModelsLoading ? (
        <Card size="sm" className="h-36 w-full">
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        </Card>
      ) : selectedReasoningModel ? (
        <Card size="sm" className="w-full">
          <div className="flex w-full p-3">
            <div className="flex w-full flex-grow flex-col gap-2 overflow-hidden">
              <div className="text-md flex items-center gap-2 font-medium">
                <Avatar
                  icon={getModelProviderLogo(
                    selectedReasoningModel.providerId,
                    false
                  )}
                  size="sm"
                />
                {selectedReasoningModel.displayName}
              </div>
              <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground dark:text-muted-foreground-night">
                {selectedReasoningModel.description}
              </div>
            </div>
            <div className="ml-4 flex-shrink-0 self-start">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    label="Select another model"
                    variant="outline"
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {reasoningModels.map((model) => (
                    <DropdownMenuItem
                      key={`${model.modelId}-${model.providerId}-${model.reasoningEffort ?? ""}`}
                      label={model.displayName}
                      icon={getModelProviderLogo(model.providerId, isDark)}
                      onClick={() => onModelSelect(model)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </Card>
      ) : (
        <Card size="sm" className="h-36 w-full">
          <div className="flex h-full w-full items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  label="Select a reasoning model"
                  variant="outline"
                  size="sm"
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {reasoningModels.map((model) => (
                  <DropdownMenuItem
                    key={`${model.modelId}-${model.providerId}-${model.reasoningEffort ?? ""}`}
                    label={model.displayName}
                    icon={getModelProviderLogo(model.providerId, isDark)}
                    onClick={() => onModelSelect(model)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      )}
    </div>
  );
}
