import { ModelPickerSelectionIndicator } from "@app/components/assistant/conversation/input_bar/ModelPickerSelectionIndicator";
import type { EffortStop } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/assistant/conversation/input_bar/ReasoningEffortSlider";
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
  // The effort to show on the slider; only read while `isSelected`.
  effort: ReasoningEffort;
  effortStops: EffortStop[];
  icon?: ComponentType;
  onSelectModel: (model: ModelConfigurationType) => void;
  onChangeEffort: (effort: ReasoningEffort) => void;
  // Whether the active selection differs from the agent default (drives the
  // revert affordance). Only relevant while `isSelected`.
  canRevert: boolean;
  onRevert: () => void;
}

// A single model row inside "More models". When it is the active selection, the
// reasoning-effort slider is revealed directly beneath it.
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
              canRevert={canRevert}
              onRevert={onRevert}
            />
          ) : undefined
        }
        onClick={() => {
          onSelectModel(model);
          // Selecting reflows the list (the effort slider mounts/unmounts),
          // which otherwise drops focus onto the input-bar editor. Keep focus
          // on the row so the menu stays put and keyboard nav still works.
          queueMicrotask(() => itemRef.current?.focus());
        }}
        // Keep the menu open so the effort slider stays reachable.
        onSelect={(e) => e.preventDefault()}
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
