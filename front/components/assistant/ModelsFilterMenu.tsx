import { getModelLogoByModelId } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import {
  Button,
  CpuChip01,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useState } from "react";

export type AgentModelFilterType = {
  modelId: string;
  displayName: string;
};

type ModelsFilterMenuProps = {
  models: AgentModelFilterType[];
  selectedModels: AgentModelFilterType[];
  setSelectedModels: (models: AgentModelFilterType[]) => void;
};

export const ModelsFilterMenu = ({
  models,
  selectedModels,
  setSelectedModels,
}: ModelsFilterMenuProps) => {
  const { isDark } = useTheme();
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState<string>("");

  const selectedModelIds = new Set(selectedModels.map((m) => m.modelId));

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
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={(open) => {
        setDropdownOpen(open);
        if (!open) {
          setModelSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={CpuChip01}
          label="Models"
          counterValue={selectedModels.length.toString()}
          isCounter={selectedModels.length > 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-96"
        dropdownHeaders={
          <DropdownMenuSearchbar
            name="modelSearch"
            placeholder="Search models"
            value={modelSearch}
            onChange={setModelSearch}
          />
        }
      >
        {filteredModels.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm">
            No models found
          </div>
        )}
        {filteredModels.map((model) => (
          <DropdownMenuCheckboxItem
            key={model.modelId}
            label={model.displayName}
            icon={getModelLogoByModelId(model.modelId, isDark)}
            truncateText
            checked={selectedModelIds.has(model.modelId)}
            onCheckedChange={() => {
              setSelectedModels(
                selectedModelIds.has(model.modelId)
                  ? selectedModels.filter((m) => m.modelId !== model.modelId)
                  : [...selectedModels, model]
              );
            }}
            // Keep the menu open so several models can be toggled in a row.
            onSelect={(event) => event.preventDefault()}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
