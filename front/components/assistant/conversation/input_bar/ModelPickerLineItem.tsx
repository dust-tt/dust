import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type { ModelWithReasoningEffort } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { REASONING_EFFORT_INFO } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { isReasoningEffort } from "@app/types/assistant/models/reasoning";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  Check,
  DropdownMenuItem,
  Icon,
} from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";

interface ModelPickerLineItemProps {
  model: ModelConfigurationType;
  efforts: ReasoningEffort[];
  // The effort used when the row itself is clicked.
  initialEffort: ReasoningEffort;
  // Non-null when this row is the current selection: shows the check mark and
  // the effort switch under the row.
  selectedEffort: ReasoningEffort | null;
  isMobile: boolean;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
  recommendation?: string;
}

// A single selectable model row, wrapped in its hover tooltip. The selected
// row exposes a compact effort switch right under it.
export function ModelPickerLineItem({
  model,
  efforts,
  initialEffort,
  selectedEffort,
  isMobile,
  onSelect,
  recommendation,
}: ModelPickerLineItemProps) {
  const isSelected = selectedEffort !== null;

  return (
    <>
      <ModelPickerRowTooltip
        description={recommendation ?? ""}
        isMobile={isMobile}
        media={
          <div className="flex flex-col text-sm">
            <div className="font-medium text-foreground dark:text-foreground-night">
              {model.displayName}
            </div>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {model.shortDescription}
            </div>
          </div>
        }
      >
        <DropdownMenuItem
          label={model.displayName}
          endComponent={
            isSelected ? <Icon visual={Check} size="xs" /> : undefined
          }
          onClick={() =>
            onSelect({ model, effort: selectedEffort ?? initialEffort })
          }
          onSelect={(e) => e.preventDefault()}
        />
      </ModelPickerRowTooltip>
      {isSelected && efforts.length > 1 && (
        <div className="px-2 pb-1.5 pt-0.5">
          <ButtonsSwitchList
            key={selectedEffort}
            size="xs"
            fullWidth
            defaultValue={selectedEffort}
            onValueChange={(value) => {
              if (isReasoningEffort(value)) {
                onSelect({ model, effort: value });
              }
            }}
          >
            {efforts.map((effort) => (
              <ButtonsSwitch
                key={effort}
                value={effort}
                label={capitalize(effort)}
                tooltip={REASONING_EFFORT_INFO[effort].reasoning}
              />
            ))}
          </ButtonsSwitchList>
        </div>
      )}
    </>
  );
}
