import { ModelPickerContent } from "@app/components/model_picker/ModelPickerContent";
import type {
  ModelPickerSelectionModel,
  ModelTierId,
  SelectedEntry,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getModelTier,
  getTierIdForMetaModelId,
} from "@app/components/model_picker/modelPickerUtils";
import { useModelPickerMenuState } from "@app/components/model_picker/useModelPickerMenuState";
import { useModelPickerModels } from "@app/components/model_picker/useModelPickerModels";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  CpuChip01,
  DropdownMenu,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

export type AgentModelFilterType = {
  modelId: string;
  displayName: string;
};

interface ModelsFilterMenuProps {
  owner: LightWorkspaceType;
  // The models the workspace's agents are actually on. Filtering by anything
  // else would return nothing, and the workspace catalog omits models an agent
  // may still sit on (feature-flagged, out-of-region or since-retired ones).
  modelIds: string[];
  selectedModels: AgentModelFilterType[];
  setSelectedModels: (models: AgentModelFilterType[]) => void;
  isCompact?: boolean;
}

export function ModelsFilterMenu({
  owner,
  modelIds,
  selectedModels,
  setSelectedModels,
  isCompact = false,
}: ModelsFilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { modelProps, allModels } = useModelPickerModels({
    owner,
    mode: "filter",
    modelIds,
  });
  const { menuStateProps, resetMenu } = useModelPickerMenuState();

  const selected = selectedModels.flatMap<SelectedEntry>((filter) => {
    const tierId = getTierIdForMetaModelId(filter.modelId);
    if (tierId) {
      return [{ kind: "tier", tierId }];
    }
    const model = allModels.find((m) => m.modelId === filter.modelId);
    return model ? [{ kind: "model", model, effort: null }] : [];
  });

  const selection: ModelPickerSelectionModel = {
    selected,
    agentDefault: null,
  };

  const toggleFilter = (filter: AgentModelFilterType) => {
    setSelectedModels(
      selectedModels.some((f) => f.modelId === filter.modelId)
        ? selectedModels.filter((f) => f.modelId !== filter.modelId)
        : [...selectedModels, filter]
    );
  };

  const onSelectTier = (tierId: ModelTierId) => {
    const { metaModelId, name } = getModelTier(tierId);
    toggleFilter({ modelId: metaModelId, displayName: name });
  };

  const onSelectModel = (model: ModelConfigurationType) => {
    toggleFilter({ modelId: model.modelId, displayName: model.displayName });
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          resetMenu();
        }
        setIsOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={CpuChip01}
          label={isCompact ? undefined : "Models"}
          tooltip={isCompact ? "Models" : undefined}
          counterValue={selectedModels.length.toString()}
          isCounter={selectedModels.length > 0}
        />
      </DropdownMenuTrigger>
      <ModelPickerContent
        {...modelProps}
        {...menuStateProps}
        side="bottom"
        selection={selection}
        onSelectTier={onSelectTier}
        onSelectModel={onSelectModel}
      />
    </DropdownMenu>
  );
}
