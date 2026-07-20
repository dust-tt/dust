import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import type {
  MakerGroup,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelWithReasoningEffortKey } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerProviderSectionProps {
  maker: MakerGroup;
  selectedKey?: string;
  isMobile: boolean;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
}

// The per-model sections (one label + its effort lines) shown for a maker.
// Rendered inside a submenu on desktop and inline under the maker name on
// mobile.
export function ModelPickerProviderSection({
  maker,
  selectedKey,
  isMobile,
  onSelect,
}: ModelPickerProviderSectionProps) {
  return (
    <>
      {maker.models.map((entry, index) => (
        <Fragment key={entry.model.modelId}>
          {index > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel label={entry.model.displayName} />
          <DropdownMenuRadioGroup value={selectedKey}>
            {entry.efforts.map((effort) => {
              const modelWithEffort = { model: entry.model, effort };
              return (
                <ModelPickerLineItem
                  key={getModelWithReasoningEffortKey(
                    entry.model.providerId,
                    entry.model.modelId,
                    effort
                  )}
                  modelWithEffort={modelWithEffort}
                  isMobile={isMobile}
                  onSelect={onSelect}
                />
              );
            })}
          </DropdownMenuRadioGroup>
        </Fragment>
      ))}
    </>
  );
}
