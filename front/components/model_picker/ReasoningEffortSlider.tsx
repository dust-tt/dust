import type { EffortStop } from "@app/components/model_picker/modelPickerUtils";
import { getReasoningEffortLabel } from "@app/components/model_picker/modelPickerUtils";
import { classNames } from "@app/lib/utils";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { SliderSteps } from "@dust-tt/sparkle";

interface ReasoningEffortSliderProps {
  stops: EffortStop[];
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
}

// A stepped slider for reasoning effort. It always shows the three canonical
// levels (Light/Medium/High); efforts the model does not support or the
// workspace's tier does not grant are rendered locked (padlock) and skipped
// when snapping. When at most one level is selectable there is nothing to
// choose, so the whole slider is disabled.
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
    stop.locked ? [index] : []
  );
  const lastIndex = Math.max(stops.length - 1, 1);
  const unlockedStops = stops.filter((stop) => !stop.locked);
  // With a single (or no) selectable level there is nothing to slide.
  const isDisabled = unlockedStops.length <= 1;

  const selectStop = (stop: EffortStop) => {
    if (!isDisabled && !stop.locked && stop.effort !== value) {
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
        disabled={isDisabled}
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
          const buttonDisabled = stop.locked || isDisabled;
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
                stop.locked ? "opacity-50" : ""
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
              {getReasoningEffortLabel(stop.effort)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
