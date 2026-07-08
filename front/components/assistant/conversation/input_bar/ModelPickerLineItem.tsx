import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type { ModelWithReasoningEffort } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getModelWithReasoningEffortKey,
  REASONING_EFFORT_INFO,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { Chip, DropdownMenuRadioItem } from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";

interface ModelPickerLineItemProps {
  modelWithEffort: ModelWithReasoningEffort;
  isMobile: boolean;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
  recommendation?: string;
}

// A single selectable model/effort row, wrapped in its hover tooltip.
export function ModelPickerLineItem({
  modelWithEffort,
  isMobile,
  onSelect,
  recommendation,
}: ModelPickerLineItemProps) {
  const key = getModelWithReasoningEffortKey(
    modelWithEffort.model.providerId,
    modelWithEffort.model.modelId,
    modelWithEffort.effort
  );
  const info = REASONING_EFFORT_INFO[modelWithEffort.effort];

  return (
    <ModelPickerRowTooltip
      description={recommendation ?? ""}
      isMobile={isMobile}
      media={
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <div className="font-medium text-foreground dark:text-foreground-night">
              {modelWithEffort.model.displayName}
            </div>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {modelWithEffort.model.shortDescription}
            </div>
          </div>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            {info.reasoning}
          </div>
        </div>
      }
    >
      <DropdownMenuRadioItem
        value={key}
        onClick={() => onSelect(modelWithEffort)}
      >
        <span className="flex grow items-center gap-2">
          <span className="line-clamp-1">
            {modelWithEffort.model.displayName}
          </span>
          {modelWithEffort.effort !== "none" && (
            <Chip size="mini" label={capitalize(modelWithEffort.effort)} />
          )}
        </span>
      </DropdownMenuRadioItem>
    </ModelPickerRowTooltip>
  );
}
