import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import type {
  MakerGroup,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelWithReasoningEffortKey } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { DropdownMenuSeparator } from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerProviderSectionProps {
  maker: MakerGroup;
  selectedKey?: string;
  defaultModelKey?: string;
  canRevert: boolean;
  onRevert: () => void;
  isMobile: boolean;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
}

// The per-model sections shown for a maker: each model's effort lines, with a
// separator between different models (no title label — the effort rows already
// carry the model name). Rendered inside a submenu on desktop and inline under
// the maker name on mobile.
export function ModelPickerProviderSection({
  maker,
  selectedKey,
  defaultModelKey,
  canRevert,
  onRevert,
  isMobile,
  onSelect,
}: ModelPickerProviderSectionProps) {
  return (
    <>
      {maker.models.map((entry, index) => (
        <Fragment key={entry.model.modelId}>
          {index > 0 && <DropdownMenuSeparator />}
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
                selectedKey={selectedKey}
                defaultModelKey={defaultModelKey}
                canRevert={canRevert}
                onRevert={onRevert}
                onSelect={onSelect}
              />
            );
          })}
        </Fragment>
      ))}
    </>
  );
}
