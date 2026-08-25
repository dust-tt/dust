import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import type {
  EffortStop,
  ModelLockReason,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelLockTooltip } from "@app/components/model_picker/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/model_picker/ReasoningEffortSlider";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { AlertCircle, DropdownMenuItem, Icon, Lock01 } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useRef } from "react";

function lockIcon(reason: ModelLockReason): ComponentType {
  return reason === "killed" ? AlertCircle : Lock01;
}

interface ModelPickerModelRowProps {
  model: EnabledModelConfigurationType;
  isSelected: boolean;
  isDefault: boolean;
  lockReason: ModelLockReason | null;
  effort: ReasoningEffort;
  effortStops: EffortStop[];
  icon?: ComponentType;
  onSelectModel: (model: EnabledModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  canRevert: boolean;
  onRevert: () => void;
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
  canRevert,
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
          <Icon
            visual={lockIcon(lockReason)}
            size="sm"
            className="text-muted-foreground"
          />
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
            <ModelPickerSelectionIndicator
              canRevert={canRevert}
              onRevert={onRevert}
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
