import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { ModelTierChip } from "@app/components/model_picker/ModelTierChip";
import type {
  EffortStop,
  ModelLockReason,
} from "@app/components/model_picker/modelPickerUtils";
import {
  DEGRADED_MODEL_TOOLTIP,
  getModelLockTooltip,
} from "@app/components/model_picker/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/model_picker/ReasoningEffortSlider";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { DropdownMenuItem, Icon, InfoCircle, Lock01 } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useRef } from "react";

interface ModelPickerModelRowProps {
  model: ModelConfigurationType;
  isSelected: boolean;
  isDefault: boolean;
  lockReason: ModelLockReason | null;
  isDegraded: boolean;
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
  isDegraded,
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
      />
    );
  }

  // A degraded model stays pickable, so it takes the lock's slot with an info
  // icon rather than being disabled.
  const endComponent =
    isSelected || isDegraded ? (
      <div className="flex items-center gap-2">
        {isDegraded && (
          <Icon visual={InfoCircle} size="sm" className="text-info-500" />
        )}
        {isSelected && (
          <>
            <ModelTierChip
              model={model}
              reasoningEffort={effort ?? undefined}
            />
            <ModelPickerSelectionIndicator onRevert={onRevert} />
          </>
        )}
      </div>
    ) : undefined;

  return (
    <>
      <DropdownMenuItem
        ref={itemRef}
        label={`${model.displayName}${isDefault ? " (Default)" : ""}`}
        icon={icon}
        truncateText
        tooltip={isDegraded ? DEGRADED_MODEL_TOOLTIP : undefined}
        endComponent={endComponent}
        onClick={() => {
          onSelectModel(model);
        }}
        onSelect={(e) => e.preventDefault()}
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
