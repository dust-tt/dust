import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  useAgentConfigurations,
  useBatchUpdateAgentModel,
} from "@app/lib/swr/assistants";
import { useModels } from "@app/lib/swr/models";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { getModelMaker } from "@app/types/assistant/models/providers";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Icon,
  Label,
  RadioGroup,
  RadioGroupCustomItem,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { useRef, useState } from "react";

const NOT_SELECTABLE_MODEL_DESCRIPTION = "Not enabled for you.";

interface SetModelAssistantsDialogProps {
  agentConfigurations: LightAgentConfigurationType[];
  disabled: boolean;
  owner: LightWorkspaceType;
}

export function SetModelAssistantsDialog({
  agentConfigurations,
  disabled,
  owner,
}: SetModelAssistantsDialogProps) {
  const { isDark } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [selectedModel, setSelectedModel] =
    useState<EnabledModelConfigurationType | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { models, isModelsLoading } = useModels({ owner, disabled: !isOpen });

  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const batchUpdateAgentModel = useBatchUpdateAgentModel({ owner });

  const searchLower = modelSearch.toLowerCase();
  const filteredModels = models
    .filter((m) => subFilter(searchLower, m.displayName.toLowerCase()))
    .sort((a, b) => {
      if (modelSearch) {
        return compareForFuzzySort(searchLower, a.displayName, b.displayName);
      }
      return a.displayName.localeCompare(b.displayName);
    });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setModelSearch("");
          setSelectedModel(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="primary"
          isSelect
          label="Set model"
          disabled={disabled}
        />
      </DialogTrigger>
      <DialogContent
        size="lg"
        height="lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Set model on {agentConfigurations.length} agent
            {pluralize(agentConfigurations.length)}
          </DialogTitle>
          <DialogDescription>
            The selected model replaces the current model of every selected
            agent. Reasoning effort is reset to the model's default, other
            settings are left untouched.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer
          fixedContent={
            <SearchInput
              ref={searchInputRef}
              name="modelSearch"
              placeholder="Search models"
              value={modelSearch}
              onChange={setModelSearch}
              disabled={isModelsLoading}
            />
          }
        >
          {isModelsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No models found
            </div>
          ) : (
            <RadioGroup
              value={selectedModel?.modelId ?? ""}
              onValueChange={(value) => {
                const model = models.find((m) => m.modelId === value);
                if (model) {
                  setSelectedModel(model);
                }
              }}
            >
              {filteredModels.map((model) => {
                const itemId = `set-model-${model.modelId}`;
                return (
                  <RadioGroupCustomItem
                    key={model.modelId}
                    id={itemId}
                    value={model.modelId}
                    disabled={!model.isSelectable}
                    iconPosition="start"
                    customItem={
                      <Label
                        htmlFor={itemId}
                        className="flex min-w-0 grow cursor-pointer items-center gap-2"
                      >
                        <Icon
                          visual={getModelMakerLogo(
                            getModelMaker(model),
                            isDark
                          )}
                          size="md"
                          className="flex-shrink-0"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="copy-sm font-medium text-foreground">
                            {model.displayName}
                          </span>
                          <span className="copy-xs text-muted-foreground">
                            {model.isSelectable
                              ? model.shortDescription
                              : NOT_SELECTABLE_MODEL_DESCRIPTION}
                          </span>
                        </div>
                      </Label>
                    }
                  />
                );
              })}
            </RadioGroup>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isSaving,
          }}
          rightButtonProps={{
            label: "Set model",
            variant: "primary",
            disabled: !selectedModel,
            isLoading: isSaving,
            onClick: async (e: React.MouseEvent) => {
              // Keep the dialog open until the update went through.
              e.preventDefault();
              if (!selectedModel) {
                return;
              }
              setIsSaving(true);
              const success = await batchUpdateAgentModel(
                agentConfigurations.map((a) => a.sId),
                { modelId: selectedModel.modelId }
              );
              void mutateAgentConfigurations();
              setIsSaving(false);
              if (success) {
                setIsOpen(false);
              }
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
