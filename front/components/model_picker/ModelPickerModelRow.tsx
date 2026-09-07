import { DegradedInfoIcon } from "@app/components/model_picker/DegradedModelIcon";
import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
import { ModelTierChip } from "@app/components/model_picker/ModelTierChip";
import type {
  EffortStop,
  ModelLockReason,
} from "@app/components/model_picker/modelPickerUtils";
import {
  getDegradedModelTooltip,
  getModelLockTooltip,
} from "@app/components/model_picker/modelPickerUtils";
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
  isDegraded: boolean;
  effort: ReasoningEffort | null;
  effortStops: EffortStop[];
  icon?: ComponentType;
  // Indents the row by one icon slot, so its label lines up with the label of
  // the maker row it is nested under (inline makers only).
  inset?: boolean;
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
  inset,
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
        inset={inset}
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
        {isDegraded && <DegradedInfoIcon />}
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
        inset={inset}
        truncateText
        tooltip={
          isDegraded ? getDegradedModelTooltip(model.displayName) : undefined
        }
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
