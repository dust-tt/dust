import { ModelPickerContent } from "@app/components/model_picker/ModelPickerContent";
import type {
  ModelTierId,
  SelectionDisplay,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getInitialEffort,
  getModelTier,
  getModelWithReasoningEffortLabel,
} from "@app/components/model_picker/modelPickerUtils";
import { useModelPickerMenuState } from "@app/components/model_picker/useModelPickerMenuState";
import { useModelPickerModels } from "@app/components/model_picker/useModelPickerModels";
import {
  useAgentConfigurations,
  useBatchUpdateAgentModel,
} from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
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
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
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
  const [pending, setPending] = useState<SelectionDisplay | null>(null);
  const [confirming, setConfirming] = useState<SelectionDisplay | null>(null);

  const { modelProps, isModelsLoading } = useModelPickerModels({
    owner,
    disabled: !isOpen,
  });
  const { menuStateProps, resetMenu } = useModelPickerMenuState();

  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const batchUpdateAgentModel = useBatchUpdateAgentModel({ owner });

  const updateModel = async () => {
    if (!confirming) {
      return;
    }

    setIsSaving(true);
    const success = await batchUpdateAgentModel(
      agentConfigurations.map((agent) => agent.sId),
      confirming.kind === "tier"
        ? { modelId: getModelTier(confirming.tierId).metaModelId }
        : {
            modelId: confirming.model.modelId,
            reasoningEffort: confirming.effort,
          }
    );
    void mutateAgentConfigurations();
    setIsSaving(false);

    if (success) {
      setConfirming(null);
      setPending(null);
    }
  };

  const onSelectTier = (tierId: ModelTierId) => {
    setPending({ kind: "tier", tierId });
  };

  const onSelectModel = (model: ModelConfigurationType) => {
    setPending({
      kind: "model",
      model,
      effort: getInitialEffort(model),
    });
  };

  const onChangeEffort = (
    model: ModelConfigurationType,
    effort: ReasoningEffort
  ) => {
    setPending({ kind: "model", model, effort });
  };

  return (
    <>
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            resetMenu();
            setPending(null);
          }
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
        {isModelsLoading ? (
          <DropdownMenuContent className="w-84" align="start" side="bottom">
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          </DropdownMenuContent>
        ) : (
          <ModelPickerContent
            {...modelProps}
            {...menuStateProps}
            side="bottom"
            selection={{
              selected: pending ? [pending] : [],
              agentDefault: null,
            }}
            onSelectTier={onSelectTier}
            onSelectModel={onSelectModel}
            onChangeEffort={onChangeEffort}
            confirm={{
              label: "Set model",
              disabled: !pending,
              onClick: () => {
                setIsOpen(false);
                setConfirming(pending);
              },
            }}
          />
        )}
      </DropdownMenu>
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !isSaving) {
            setConfirming(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Set {agentConfigurations.length} agent
              {pluralize(agentConfigurations.length)} to{" "}
              {confirming && getModelWithReasoningEffortLabel(confirming)}?
            </DialogTitle>
            <DialogDescription>
              This will replace the current model and reasoning effort for every
              selected agent. All other settings will remain unchanged.
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
