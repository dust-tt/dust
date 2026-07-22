import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type { ModelWithReasoningEffort } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { REASONING_EFFORT_INFO } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/assistant/conversation/input_bar/ReasoningEffortSlider";
import { RevertToDefaultIndicator } from "@app/components/assistant/conversation/input_bar/RevertToDefaultIndicator";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { DropdownMenuItem } from "@dust-tt/sparkle";

interface ModelPickerLineItemProps {
  model: ModelConfigurationType;
  // The efforts the model supports, low to high. Drives the slider positions.
  efforts: ReasoningEffort[];
  isMobile: boolean;
  // The selected effort when this model is the current selection, else null.
  // When set, the row is marked and the effort slider is revealed beneath it.
  selectedEffort: ReasoningEffort | null;
  // Whether this model is the one the selection reverts to (the "(Default)"
  // marker).
  isDefaultModel: boolean;
  // The selected model's check turns into a clickable X on hover to revert to
  // the default.
  canRevert: boolean;
  onRevert: () => void;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
  recommendation?: string;
}

// The effort a model lands on when first selected: its own default when
// supported, otherwise the lowest available.
function initialEffort(
  model: ModelConfigurationType,
  efforts: ReasoningEffort[]
): ReasoningEffort {
  const modelDefault = model.defaultReasoningEffort;
  return efforts.includes(modelDefault) ? modelDefault : efforts[0];
}

// A single selectable model row, wrapped in its hover tooltip. Selecting it
// commits the model (at its default effort) and reveals a reasoning-effort
// slider beneath the row; the slider then adjusts the effort in place. The
// current selection is marked with a check that turns into a clickable X on row
// hover to revert to the default; the default model carries a "(Default)" label.
export function ModelPickerLineItem({
  model,
  efforts,
  isMobile,
  selectedEffort,
  isDefaultModel,
  canRevert,
  onRevert,
  onSelect,
  recommendation,
}: ModelPickerLineItemProps) {
  const selected = selectedEffort !== null;
  const info = selectedEffort
    ? REASONING_EFFORT_INFO[selectedEffort]
    : undefined;

  return (
    <>
      <ModelPickerRowTooltip
        description={recommendation ?? ""}
        isMobile={isMobile}
        media={
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <div className="font-medium text-foreground dark:text-foreground-night">
                {model.displayName}
              </div>
              <div className="text-muted-foreground dark:text-muted-foreground-night">
                {model.shortDescription}
              </div>
            </div>
            {info && (
              <div className="text-muted-foreground dark:text-muted-foreground-night">
                {info.reasoning}
              </div>
            )}
          </div>
        }
      >
        <DropdownMenuItem
          className="group/model-row"
          onClick={() => {
            if (!selected) {
              onSelect({ model, effort: initialEffort(model, efforts) });
            }
          }}
          // Keep the menu open on selection so the effort slider stays visible
          // and adjustable.
          onSelect={(e) => e.preventDefault()}
        >
          <span className="flex w-full items-center gap-2">
            <span className="line-clamp-1">{model.displayName}</span>
            {isDefaultModel && (
              <span className="text-xs font-normal text-muted-foreground dark:text-muted-foreground-night">
                (Default)
              </span>
            )}
            <span className="ml-auto flex items-center">
              {selected && (
                <RevertToDefaultIndicator
                  canRevert={canRevert}
                  onRevert={onRevert}
                />
              )}
            </span>
          </span>
        </DropdownMenuItem>
      </ModelPickerRowTooltip>
      {/* The slider only makes sense when there is more than one effort to pick
          between; a model with a single effort just shows as selected. */}
      {selected && selectedEffort && efforts.length > 1 && (
        <ReasoningEffortSlider
          efforts={efforts}
          value={selectedEffort}
          onChange={(effort) => onSelect({ model, effort })}
        />
      )}
    </>
  );
}
