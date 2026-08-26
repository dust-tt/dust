import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import { MODEL_TIERS } from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  Check,
  ChevronRight,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
} from "@dust-tt/sparkle";
import type { ComponentType, ReactNode } from "react";
import { useState } from "react";

export interface ModelMenuItem {
  modelId: string;
  displayName: string;
}

interface ModelsMenuContentProps {
  models: ModelMenuItem[];
  renderModelItem: (model: ModelMenuItem, icon?: ComponentType) => ReactNode;
  isOpen: boolean;
  isModelSelected?: (model: ModelMenuItem) => boolean;
  searchAutoFocus?: boolean;
}

type ModelsMenuContentInternalProps = Omit<ModelsMenuContentProps, "isOpen">;

interface ModelMakerGroup {
  makerId: ModelMakerIdType;
  models: ModelMenuItem[];
}

export function ModelsMenuContent({
  isOpen,
  ...props
}: ModelsMenuContentProps) {
  return (
    <ModelsMenuContentInternal key={isOpen ? "open" : "closed"} {...props} />
  );
}

function ModelsMenuContentInternal({
  models,
  renderModelItem,
  isModelSelected,
  searchAutoFocus = true,
}: ModelsMenuContentInternalProps) {
  const { isDark } = useTheme();
  const [modelSearch, setModelSearch] = useState("");
  const modelsById = new Map(models.map((model) => [model.modelId, model]));
  const tierModels = MODEL_TIERS.map((tier) => ({
    modelId: tier.metaModelId,
    displayName: tier.name,
    tierId: tier.id,
  }));

  const knownModelIds = new Set<string>();
  const modelsByMaker = new Map<ModelMakerIdType, ModelMenuItem[]>();
  for (const modelConfig of getSupportedModelConfigs()) {
    const model = modelsById.get(modelConfig.modelId);
    if (
      model &&
      !isModelStreamId(model.modelId) &&
      !knownModelIds.has(model.modelId)
    ) {
      knownModelIds.add(model.modelId);
      const makerId = getModelMaker(modelConfig);
      const makerModels = modelsByMaker.get(makerId);
      if (makerModels) {
        makerModels.push(model);
      } else {
        modelsByMaker.set(makerId, [model]);
      }
    }
  }

  const makerGroups: ModelMakerGroup[] = Array.from(
    modelsByMaker.entries(),
    ([makerId, makerModels]) => ({ makerId, models: makerModels })
  );
  const makerByModelId = new Map<string, ModelMakerIdType>(
    makerGroups.flatMap((group) =>
      group.models.map((model) => [model.modelId, group.makerId] as const)
    )
  );
  const unknownModels = models.filter(
    (model) =>
      !isModelStreamId(model.modelId) && !knownModelIds.has(model.modelId)
  );
  const concreteModels = [
    ...makerGroups.flatMap((group) => group.models),
    ...unknownModels,
  ];
  const hasSelectedConcreteModel =
    isModelSelected !== undefined && concreteModels.some(isModelSelected);
  const query = modelSearch.trim().toLowerCase();
  const isSearching = query !== "";
  const searchResults = isSearching
    ? concreteModels.filter((model) => {
        const makerId = makerByModelId.get(model.modelId);
        return (
          model.displayName.toLowerCase().includes(query) ||
          (makerId !== undefined &&
            getModelMakerDisplayName(makerId).toLowerCase().includes(query))
        );
      })
    : [];

  return (
    <>
      <DropdownMenuLabel label="Model" />
      {tierModels.map((model) =>
        renderModelItem(model, MODEL_TIER_ICON[model.tierId])
      )}
      {tierModels.length > 0 && concreteModels.length > 0 && (
        <DropdownMenuSeparator />
      )}
      {concreteModels.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger onClick={(event) => event.stopPropagation()}>
            <span className="grow truncate text-left">More models</span>
            {hasSelectedConcreteModel && (
              <Icon
                visual={Check}
                size="sm"
                className="text-muted-foreground"
              />
            )}
            <Icon
              visual={ChevronRight}
              size="xs"
              className="text-muted-foreground"
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="max-h-112 w-64 overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-overlay-background">
              <DropdownMenuSearchbar
                autoFocus={searchAutoFocus}
                name="search-models"
                placeholder="Search for model"
                value={modelSearch}
                onChange={setModelSearch}
              />
            </div>
            {isSearching ? (
              searchResults.length > 0 ? (
                searchResults.map((model) => renderModelItem(model))
              ) : (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  No models found
                </div>
              )
            ) : (
              <>
                {makerGroups.map((maker) => (
                  <DropdownMenuSub key={maker.makerId}>
                    <DropdownMenuSubTrigger>
                      <Icon
                        visual={getModelMakerLogo(maker.makerId, isDark)}
                        size="sm"
                      />
                      <span className="grow truncate text-left">
                        {getModelMakerDisplayName(maker.makerId)}
                      </span>
                      {isModelSelected !== undefined &&
                        maker.models.some(isModelSelected) && (
                          <Icon
                            visual={Check}
                            size="sm"
                            className="text-muted-foreground"
                          />
                        )}
                      <Icon
                        visual={ChevronRight}
                        size="xs"
                        className="text-muted-foreground"
                      />
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className="max-h-96 w-64 overflow-y-auto"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {maker.models.map((model) => renderModelItem(model))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
                {unknownModels.length > 0 && (
                  <>
                    <DropdownMenuLabel label="Other models" />
                    {unknownModels.map((model) => renderModelItem(model))}
                  </>
                )}
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  );
}
