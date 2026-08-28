import { ModelPickerSelectionIndicator } from "@app/components/model_picker/ModelPickerSelectionIndicator";
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
import {
  DropdownMenuItem,
  Icon,
  Lock01,
  MOTION_DURATIONS,
  MOTION_EASINGS,
} from "@dust-tt/sparkle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ComponentType } from "react";
import { useRef } from "react";

// Opening the slider both grows the row and reveals its contents; the opacity
// lands first so the slider reads as present before the space finishes opening.
// The height spring stays a spring (springs aren't part of the CSS-token
// system) but the opacity fade now uses the same enter token as every other
// dropdown/popover surface instead of a bare "easeOut" string.
const EFFORT_REVEAL_TRANSITION = {
  height: { type: "spring", bounce: 0, duration: MOTION_DURATIONS.enter },
  opacity: { duration: MOTION_DURATIONS.exit, ease: MOTION_EASINGS.enter },
} as const;

interface ModelPickerModelRowProps {
  model: ModelConfigurationType;
  isSelected: boolean;
  isDefault: boolean;
  lockReason: ModelLockReason | null;
  effort: ReasoningEffort;
  effortStops: EffortStop[];
  icon?: ComponentType;
  onSelectModel: (model: ModelConfigurationType) => void;
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
  const prefersReducedMotion = useReducedMotion();

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
      <AnimatePresence initial={false}>
        {isSelected && effortStops.length > 0 && (
          <motion.div
            key="effort"
            // The row is mid-list, so the reveal has to open space rather than
            // fade in on top of the rows below it.
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : EFFORT_REVEAL_TRANSITION
            }
            className="overflow-hidden"
          >
            <ReasoningEffortSlider
              stops={effortStops}
              value={effort}
              onChange={onChangeEffort}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
