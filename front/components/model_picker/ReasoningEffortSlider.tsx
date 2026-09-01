import type { EffortStop } from "@app/components/model_picker/modelPickerUtils";
import { getEffortStopTooltip } from "@app/components/model_picker/modelPickerUtils";
import { classNames } from "@app/lib/utils";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { SliderSteps } from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";

interface ReasoningEffortSliderProps {
  stops: EffortStop[];
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}

// A stepped slider for reasoning effort. It always shows the three canonical
// levels (Light/Medium/High). Unsupported efforts render with a slash; efforts
// outside the member's access render with a padlock. Both are skipped when
// snapping. When at most one level is selectable there is nothing to choose,
// so the whole slider is disabled.
export function ReasoningEffortSlider({
  stops,
  value,
  onChange,
}: ReasoningEffortSliderProps) {
  const valueIndex = Math.max(
    stops.findIndex((stop) => stop.effort === value),
    0
  );
  const lockedSteps = stops.flatMap((stop, index) =>
    stop.unavailabilityReason !== null &&
    stop.unavailabilityReason !== "unsupported"
      ? [index]
      : []
  );
  const unavailableSteps = stops.flatMap((stop, index) =>
    stop.unavailabilityReason === "unsupported" ? [index] : []
  );
  const lastIndex = Math.max(stops.length - 1, 1);
  const availableStops = stops.filter(
    (stop) => stop.unavailabilityReason === null
  );
  // With a single (or no) selectable level there is nothing to slide.
  const isDisabled = availableStops.length <= 1;

  const selectStop = (stop: EffortStop) => {
    if (
      !isDisabled &&
      stop.unavailabilityReason === null &&
      stop.effort !== value
    ) {
      onChange(stop.effort);
    }
  };

  return (
    <div
      className="flex flex-col gap-1.5 px-2 py-1.5"
      // The slider lives inside a dropdown item region; stop the click from
      // bubbling to Radix (which would otherwise select/close).
      onClick={(e) => e.stopPropagation()}
    >
      <SliderSteps
        stepCount={stops.length}
        value={valueIndex}
        lockedSteps={lockedSteps}
        unavailableSteps={unavailableSteps}
        disabled={isDisabled}
        stepTooltips={stops.map(getEffortStopTooltip)}
        onChange={(index) => {
          const next = stops[index];
          if (next) {
            selectStop(next);
          }
        }}
        ariaLabel="Reasoning effort"
      />

      <div className="relative h-4 text-xs">
        {stops.map((stop, index) => {
          const isFirst = index === 0;
          const isLast = index === stops.length - 1;
          const buttonDisabled =
            stop.unavailabilityReason !== null || isDisabled;
          return (
            <button
              key={stop.effort}
              type="button"
              disabled={buttonDisabled}
              onClick={(e) => {
                e.stopPropagation();
                selectStop(stop);
              }}
              className={classNames(
                "absolute whitespace-nowrap",
                buttonDisabled ? "cursor-not-allowed" : "cursor-pointer",
                stop.effort === value
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
                stop.unavailabilityReason !== null ? "opacity-50" : ""
              )}
              style={{
                left: `${(index / lastIndex) * 100}%`,
                transform: isFirst
                  ? "translateX(0)"
                  : isLast
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              {capitalize(stop.effort)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
