import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type { ModelWithReasoningEffort } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getModelWithReasoningEffortKey,
  REASONING_EFFORT_INFO,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { RevertToDefaultIndicator } from "@app/components/assistant/conversation/input_bar/RevertToDefaultIndicator";
import { Chip, DropdownMenuItem } from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";

interface ModelPickerLineItemProps {
  modelWithEffort: ModelWithReasoningEffort;
  isMobile: boolean;
  selectedKey?: string;
  defaultModelKey?: string;
  canRevert: boolean;
  onRevert: () => void;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
  recommendation?: string;
}

// A single selectable model/effort row, wrapped in its hover tooltip. The
// current selection is marked with a check that turns into a clickable X on row
// hover to revert to the default; the default model carries a "(Default)" label.
export function ModelPickerLineItem({
  modelWithEffort,
  isMobile,
  selectedKey,
  defaultModelKey,
  canRevert,
  onRevert,
  onSelect,
  recommendation,
}: ModelPickerLineItemProps) {
  const key = getModelWithReasoningEffortKey(
    modelWithEffort.model.providerId,
    modelWithEffort.model.modelId,
    modelWithEffort.effort
  );
  const selected = key === selectedKey;
  const isDefault = key === defaultModelKey;
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
      <DropdownMenuItem
        className="group/model-row"
        onClick={() => onSelect(modelWithEffort)}
      >
        <span className="flex w-full items-center gap-2">
          <span className="line-clamp-1">
            {modelWithEffort.model.displayName}
          </span>
          {modelWithEffort.effort !== "none" && (
            <Chip size="mini" label={capitalize(modelWithEffort.effort)} />
          )}
          {isDefault && (
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
  );
}
