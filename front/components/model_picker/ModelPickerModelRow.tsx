import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { ModelTierChip } from "@app/components/model_picker/ModelTierChip";
import type {
  EffortStop,
  ModelLockReason,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelLockTooltip } from "@app/components/model_picker/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/model_picker/ReasoningEffortSlider";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { DropdownMenuItem, Icon, Lock01 } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useRef } from "react";

interface ModelPickerModelRowProps {
  model: ModelConfigurationType;
  isSelected: boolean;
  isDefault: boolean;
  lockReason: ModelLockReason | null;
  effort: ReasoningEffort | null;
  effortStops: EffortStop[];
  icon?: ComponentType;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort?: (effort: ReasoningEffort) => void;
  onRevert?: () => void;
}

export function ModelPickerModelRow({
  model,
  isSelected,
  isDefault,
  lockReason,
  effort,
  effortStops,
  icon,
  onSelectModel,
  onChangeEffort,
  onRevert,
}: ModelPickerModelRowProps) {
  const itemRef = useRef<HTMLDivElement>(null);

  if (lockReason) {
    return (
      <DropdownMenuItem
        ref={itemRef}
        label={model.displayName}
        icon={icon}
        truncateText
        disabled
        tooltip={getModelLockTooltip(lockReason)}
        endComponent={
          <Icon visual={Lock01} size="sm" className="text-muted-foreground" />
        }
        onSelect={(e) => e.preventDefault()}
      />
    );
  }

  return (
    <>
      <DropdownMenuItem
        ref={itemRef}
        label={`${model.displayName}${isDefault ? " (Default)" : ""}`}
        icon={icon}
        truncateText
        endComponent={
          isSelected ? (
            <div className="flex items-center gap-2">
              <ModelTierChip
                model={model}
                reasoningEffort={effort ?? undefined}
              />
              <ModelPickerSelectionIndicator onRevert={onRevert} />
            </div>
          ) : undefined
        }
        onClick={() => {
          onSelectModel(model);
        }}
      />
      {isSelected &&
        effortStops.length > 0 &&
        effort !== null &&
        onChangeEffort && (
          <ReasoningEffortSlider
            stops={effortStops}
            value={effort}
            onChange={onChangeEffort}
          />
        )}
    </>
  );
}
