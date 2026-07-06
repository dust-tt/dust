import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import type {
  ModelLine,
  ProviderGroup,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getLineKey } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerProviderSectionProps {
  provider: ProviderGroup;
  selectedKey?: string;
  isMobile: boolean;
  onSelect: (line: ModelLine) => void;
}

// The per-model sections (one label + its effort lines) shown for a provider.
// Rendered inside a submenu on desktop and inline under the provider name on
// mobile.
export function ModelPickerProviderSection({
  provider,
  selectedKey,
  isMobile,
  onSelect,
}: ModelPickerProviderSectionProps) {
  return (
    <>
      {provider.models.map((entry, index) => (
        <Fragment key={entry.model.modelId}>
          {index > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel label={entry.model.displayName} />
          <DropdownMenuRadioGroup value={selectedKey}>
            {entry.efforts.map((effort) => {
              const line = { model: entry.model, effort };
              return (
                <ModelPickerLineItem
                  key={getLineKey(
                    entry.model.providerId,
                    entry.model.modelId,
                    effort
                  )}
                  line={line}
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
