import { ModelsMenuContent } from "@app/components/assistant/ModelsMenuContent";
import {
  Button,
  Check,
  CpuChip01,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useState } from "react";

export type AgentModelFilterType = {
  modelId: string;
  displayName: string;
};

interface ModelsFilterMenuProps {
  models: AgentModelFilterType[];
  selectedModels: AgentModelFilterType[];
  setSelectedModels: (models: AgentModelFilterType[]) => void;
  isCompact?: boolean;
}

interface ModelFilterItemProps {
  model: AgentModelFilterType;
  icon?: ComponentType;
  isSelected: boolean;
  onToggle: (model: AgentModelFilterType) => void;
}

function ModelFilterItem({
  model,
  icon,
  isSelected,
  onToggle,
}: ModelFilterItemProps) {
  return (
    <DropdownMenuItem
      role="menuitemcheckbox"
      aria-checked={isSelected}
      label={model.displayName}
      icon={icon}
      truncateText
      endComponent={
        isSelected ? (
          <Icon visual={Check} size="sm" className="text-muted-foreground" />
        ) : undefined
      }
      onSelect={(event) => {
        event.preventDefault();
        onToggle(model);
      }}
    />
  );
}

export function ModelsFilterMenu({
  models,
  selectedModels,
  setSelectedModels,
  isCompact = false,
}: ModelsFilterMenuProps) {
  const [isDropdownOpen, setDropdownOpen] = useState(false);

  const selectedModelIds = new Set(
    selectedModels.map((model) => model.modelId)
  );
  const toggleModel = (model: AgentModelFilterType) => {
    setSelectedModels(
      selectedModelIds.has(model.modelId)
        ? selectedModels.filter(
            (selected) => selected.modelId !== model.modelId
          )
        : [...selectedModels, model]
    );
  };

  return (
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={(open) => {
        setDropdownOpen(open);
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
      <DropdownMenuContent className="w-80" align="start">
        <ModelsMenuContent
          models={models}
          isOpen={isDropdownOpen}
          isModelSelected={(model) => selectedModelIds.has(model.modelId)}
          searchAutoFocus={!isCompact}
          renderModelItem={(model, icon) => (
            <ModelFilterItem
              key={model.modelId}
              model={model}
              icon={icon}
              isSelected={selectedModelIds.has(model.modelId)}
              onToggle={toggleModel}
            />
          )}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
