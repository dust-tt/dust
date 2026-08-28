import { ModelPickerModelRow } from "@app/components/model_picker/ModelPickerModelRow";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import {
  getEffortStops,
  getInitialEffort,
  getModelKey,
  getModelLockReason,
  isModelSelection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { ArrowLeft, DropdownMenuItem } from "@dust-tt/sparkle";

interface ModelPickerModelsViewProps {
  makerId: ModelMakerIdType;
  models: ModelConfigurationType[];
  shown: Selection;
  agentDefault: Selection;
  canRevert: boolean;
  lockPremiumEfforts: boolean;
  onBack: () => void;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  onRevert: () => void;
}

export function ModelPickerModelsView({
  makerId,
  models,
  shown,
  agentDefault,
  canRevert,
  lockPremiumEfforts,
  onBack,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerModelsViewProps) {
  return (
    <>
      <DropdownMenuItem
        icon={ArrowLeft}
        label={getModelMakerDisplayName(makerId)}
        truncateText
        onClick={onBack}
        onSelect={(e) => e.preventDefault()}
      />
      {models.map((model) => {
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
            onSelectModel={onSelectModel}
            onChangeEffort={onChangeEffort}
            canRevert={canRevert}
            onRevert={onRevert}
          />
        );
      })}
    </>
  );
}
