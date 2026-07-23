import { ModelPickerSelectionIndicator } from "@app/components/shared/model_picker/ModelPickerSelectionIndicator";
import type { EffortStop } from "@app/components/shared/model_picker/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/shared/model_picker/ReasoningEffortSlider";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { DropdownMenuItem } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useRef } from "react";

interface ModelPickerModelRowProps {
  model: ModelConfigurationType;
  isSelected: boolean;
  isDefault: boolean;
  effort: ReasoningEffort;
  effortStops: EffortStop[];
  icon?: ComponentType;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  canRevert?: boolean;
  onRevert?: () => void;
}

export function ModelPickerModelRow({
  model,
  isSelected,
  isDefault,
  effort,
  effortStops,
  icon,
  onSelectModel,
  onChangeEffort,
  canRevert,
  onRevert,
}: ModelPickerModelRowProps) {
  const itemRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <DropdownMenuItem
        ref={itemRef}
        label={`${model.displayName}${isDefault ? " (Default)" : ""}`}
        icon={icon}
        truncateText
        endComponent={
          isSelected ? (
            <ModelPickerSelectionIndicator
              canRevert={canRevert ?? false}
              onRevert={onRevert ?? (() => {})}
            />
          ) : undefined
        }
        onClick={() => {
          onSelectModel(model);
        }}
      />
      {isSelected && effortStops.length > 0 && (
        <ReasoningEffortSlider
          stops={effortStops}
          value={effort}
          onChange={onChangeEffort}
        />
      )}
    </>
  );
}
