import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type { ModelLine } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getLineKey,
  REASONING_EFFORT_INFO,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { Chip, DropdownMenuRadioItem } from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";

interface ModelPickerLineItemProps {
  line: ModelLine;
  isMobile: boolean;
  onSelect: (line: ModelLine) => void;
  recommendation?: string;
}

// A single selectable model/effort row, wrapped in its hover tooltip.
export function ModelPickerLineItem({
  line,
  isMobile,
  onSelect,
  recommendation,
}: ModelPickerLineItemProps) {
  const key = getLineKey(
    line.model.providerId,
    line.model.modelId,
    line.effort
  );
  const info = REASONING_EFFORT_INFO[line.effort];

  return (
    <ModelPickerRowTooltip
      description={recommendation ?? ""}
      isMobile={isMobile}
      media={
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <div className="font-medium text-foreground dark:text-foreground-night">
              {line.model.displayName}
            </div>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {line.model.shortDescription}
            </div>
          </div>
          <div className="text-muted-foreground dark:text-muted-foreground-night">
            {info.reasoning}
          </div>
        </div>
      }
    >
      <DropdownMenuRadioItem value={key} onClick={() => onSelect(line)}>
        <span className="flex grow items-center gap-2">
          <span className="line-clamp-1">{line.model.displayName}</span>
          {line.effort !== "none" && (
            <Chip size="mini" label={capitalize(line.effort)} />
          )}
        </span>
      </DropdownMenuRadioItem>
    </ModelPickerRowTooltip>
  );
}
