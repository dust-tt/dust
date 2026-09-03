import { DegradedModelIcon } from "@app/components/model_picker/DegradedModelIcon";
import { ModelPickerModelRow } from "@app/components/model_picker/ModelPickerModelRow";
import type {
  MakerGroup,
  ModelPickerSelectionModel,
} from "@app/components/model_picker/modelPickerUtils";
import {
  findSelectedModelEntry,
  getEffortStops,
  getInitialEffort,
  getModelKey,
  getModelLockReason,
  isModelSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@dust-tt/sparkle";

interface ModelPickerMakersViewProps {
  makerGroups: MakerGroup[];
  selection: ModelPickerSelectionModel;
  ignoreTierRestrictions: boolean;
  // When true, premium (model, effort) picks are locked (workspace not on a
  // credit-based plan).
  lockPremiumEfforts: boolean;
  degradedModelIds: ReadonlySet<string>;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort?: (
    model: ModelConfigurationType,
    effort: ReasoningEffort
  ) => void;
}

export function ModelPickerMakersView({
  makerGroups,
  selection,
  ignoreTierRestrictions,
  lockPremiumEfforts,
  degradedModelIds,
  onSelectModel,
  onChangeEffort,
}: ModelPickerMakersViewProps) {
  const { isDark } = useTheme();

  return (
    <>
      {makerGroups.map((maker) => {
        const makerLogo = getModelMakerLogo(maker.makerId, isDark);
        const hasDegradedModel = maker.models.some((model) =>
          degradedModelIds.has(model.modelId)
        );
        return (
          <DropdownMenuSub key={maker.makerId}>
            <DropdownMenuSubTrigger
              label={getModelMakerDisplayName(maker.makerId)}
              icon={
                hasDegradedModel ? (
                  <DegradedModelIcon icon={makerLogo} surface="menu" />
                ) : (
                  makerLogo
                )
              }
            />
            <DropdownMenuSubContent className="w-64">
              {maker.models.map((model) => {
                const selectedEntry = findSelectedModelEntry(model, selection);
                const isSelected = selectedEntry !== undefined;
                const isDefault =
                  selection.agentDefault !== null &&
                  isModelSelection(model, selection.agentDefault);
                const lockReason = ignoreTierRestrictions
                  ? null
                  : getModelLockReason(model, { lockPremiumEfforts });
                const effort = selectedEntry
                  ? selectedEntry.effort
                  : getInitialEffort(model, { lockPremiumEfforts });
                return (
                  <ModelPickerModelRow
                    key={getModelKey(model.providerId, model.modelId)}
                    model={model}
                    isSelected={isSelected}
                    isDefault={isDefault}
                    lockReason={lockReason}
                    isDegraded={degradedModelIds.has(model.modelId)}
                    effort={effort}
                    effortStops={getEffortStops(model, { lockPremiumEfforts })}
                    onSelectModel={onSelectModel}
                    onChangeEffort={
                      onChangeEffort && ((next) => onChangeEffort(model, next))
                    }
                    onRevert={isSelected ? selection.onRevert : undefined}
                  />
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </>
  );
}
