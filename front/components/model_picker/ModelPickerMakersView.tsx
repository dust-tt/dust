import { ModelPickerModelRow } from "@app/components/model_picker/ModelPickerModelRow";
import type {
  MakerGroup,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getEffortStops,
  getInitialEffort,
  getModelKey,
  getModelLockReason,
  isModelSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  Icon,
} from "@dust-tt/sparkle";

interface ModelPickerMakersViewProps {
  makerGroups: MakerGroup[];
  allModels: ModelConfigurationType[];
  shown: Selection;
  agentDefault: Selection;
  // Whether the active selection differs from the agent default.
  canRevert: boolean;
  // When true, premium (model, effort) picks are locked (workspace not on a
  // credit-based plan).
  lockPremiumEfforts: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onBack: () => void;
  onSelectMaker: (makerId: ModelMakerIdType) => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
}

// The "More models" step: every provider, or (while searching) a flat list of
// every model regardless of provider.
export function ModelPickerMakersView({
  makerGroups,
  allModels,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  search,
  onSearchChange,
  onBack,
  onSelectMaker,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerMakersViewProps) {
  const { isDark } = useTheme();

  const query = search.trim().toLowerCase();
  const isSearching = query !== "";
  const searchResults = isSearching
    ? allModels.filter(
        (model) =>
          model.displayName.toLowerCase().includes(query) ||
          getModelMakerDisplayName(getModelMaker(model))
            .toLowerCase()
            .includes(query)
      )
    : [];

  const selectedModelMaker =
    shown.display.kind === "model" ? getModelMaker(shown.display.model) : null;

  const renderModelRow = (model: ModelConfigurationType) => {
    const isSelected = isModelSelection(model, shown.display);
    const isDefault = isModelSelection(model, agentDefault.display);
    const lockReason = getModelLockReason(model, { lockPremiumEfforts });
    const effort =
      isSelected && shown.display.kind === "model"
        ? shown.display.effort
        : getInitialEffort(model, { lockPremiumEfforts });
    return (
      <ModelPickerModelRow
        key={getModelKey(model.providerId, model.modelId)}
        model={model}
        isSelected={isSelected}
        isDefault={isDefault}
        lockReason={lockReason}
        effort={effort}
        effortStops={getEffortStops(model, { lockPremiumEfforts })}
        icon={getModelMakerLogo(getModelMaker(model), isDark)}
        onSelectModel={onSelectModel}
        onChangeEffort={onChangeEffort}
        canRevert={canRevert}
        onRevert={onRevert}
      />
    );
  };

  return (
    <>
      <DropdownMenuItem
        icon={ArrowLeft}
        label="More models"
        truncateText
        onClick={onBack}
      />
      <div className="sticky top-0 z-10 bg-overlay-background">
        <DropdownMenuSearchbar
          autoFocus
          name="search-models"
          placeholder="Search for model"
          value={search}
          onChange={onSearchChange}
        />
      </div>
      {isSearching ? (
        searchResults.length > 0 ? (
          searchResults.map(renderModelRow)
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            No models found
          </div>
        )
      ) : (
        makerGroups.map((maker) => (
          <DropdownMenuItem
            key={maker.makerId}
            label={getModelMakerDisplayName(maker.makerId)}
            icon={getModelMakerLogo(maker.makerId, isDark)}
            endComponent={
              <div className="flex items-center gap-1">
                {selectedModelMaker === maker.makerId && (
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
              </div>
            }
            onClick={() => onSelectMaker(maker.makerId)}
          />
        ))
      )}
    </>
  );
}
