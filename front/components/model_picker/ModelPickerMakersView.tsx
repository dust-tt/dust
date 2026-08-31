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
  shown: Selection;
  agentDefault: Selection;
  // Whether the active selection differs from the agent default.
  canRevert: boolean;
  // When true, premium (model, effort) picks are locked (workspace not on a
  // credit-based plan).
  lockPremiumEfforts: boolean;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
}

export function ModelPickerMakersView({
  makerGroups,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerMakersViewProps) {
  const { isDark } = useTheme();

  return (
    <>
      {makerGroups.map((maker) => (
        <DropdownMenuSub key={maker.makerId}>
          <DropdownMenuSubTrigger
            label={getModelMakerDisplayName(maker.makerId)}
            icon={getModelMakerLogo(maker.makerId, isDark)}
          />
          <DropdownMenuSubContent className="w-64">
            {maker.models.map((model) => {
              const isSelected = isModelSelection(model, shown.display);
              const isDefault = isModelSelection(model, agentDefault.display);
              const lockReason = getModelLockReason(model, {
                lockPremiumEfforts,
              });
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
                  onSelectModel={onSelectModel}
                  onChangeEffort={onChangeEffort}
                  canRevert={canRevert}
                  onRevert={onRevert}
                />
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
    </>
  );
}
