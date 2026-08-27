import type { ModelMenuItem } from "@app/components/assistant/ModelsMenuContent";
import { ModelsMenuContent } from "@app/components/assistant/ModelsMenuContent";
import {
  useAgentConfigurations,
  useBatchUpdateAgentModel,
} from "@app/lib/swr/assistants";
import { useModels } from "@app/lib/swr/models";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelMenuItem | null>(
    null
  );

  const { models, isModelsLoading } = useModels({ owner, disabled: !isOpen });
  const modelsById = new Map<string, EnabledModelConfigurationType>(
    models.map((model) => [model.modelId, model])
  );

  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const batchUpdateAgentModel = useBatchUpdateAgentModel({ owner });

  const updateModel = async () => {
    if (!selectedModel) {
      return;
    }

    setIsSaving(true);
    const success = await batchUpdateAgentModel(
      agentConfigurations.map((agent) => agent.sId),
      { modelId: selectedModel.modelId }
    );
    void mutateAgentConfigurations();
    setIsSaving(false);

    if (success) {
      setSelectedModel(null);
    }
  };

  const renderModelItem = (model: ModelMenuItem, icon?: ComponentType) => {
    const enabledModel = modelsById.get(model.modelId);
    const isDisabled =
      isSaving || (enabledModel !== undefined && !enabledModel.isSelectable);
    return (
      <DropdownMenuItem
        key={model.modelId}
        label={model.displayName}
        icon={icon}
        description={enabledModel?.shortDescription}
        disabled={isDisabled}
        onClick={() => setSelectedModel(model)}
      />
    );
  };

  return (
    <>
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="primary"
            isSelect
            label="Set model"
            disabled={disabled}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80" align="start">
          {isModelsLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <ModelsMenuContent
              models={models}
              isOpen={isOpen}
              renderModelItem={renderModelItem}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={selectedModel !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) {
            setSelectedModel(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Set {agentConfigurations.length} agent
              {pluralize(agentConfigurations.length)} to{" "}
              {selectedModel?.displayName}?
            </DialogTitle>
            <DialogDescription>
              This will replace the current model for every selected agent.
              Reasoning effort will reset to the model&apos;s default. All other
              settings will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              disabled: isSaving,
            }}
            rightButtonProps={{
              label: "Set model",
              variant: "primary",
              isLoading: isSaving,
              onClick: (event) => {
                event.preventDefault();
                void updateModel();
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
