import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import type {
  ModelWithReasoningEffort,
  ProviderGroup,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  getInitialReasoningEffort,
  getModelKey,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";

interface ModelPickerProviderSectionProps {
  provider: ProviderGroup;
  selected: ModelWithReasoningEffort | null;
  isMobile: boolean;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
}

// The model rows shown for a provider. Rendered inside a submenu on desktop
// and inline under the provider name on mobile.
export function ModelPickerProviderSection({
  provider,
  selected,
  isMobile,
  onSelect,
}: ModelPickerProviderSectionProps) {
  const selectedKey = selected
    ? getModelKey(selected.model.providerId, selected.model.modelId)
    : null;

  return (
    <>
      {provider.models.map((entry) => (
        <ModelPickerLineItem
          key={entry.model.modelId}
          model={entry.model}
          efforts={entry.efforts}
          initialEffort={getInitialReasoningEffort(entry.model)}
          selectedEffort={
            selected &&
            selectedKey ===
              getModelKey(entry.model.providerId, entry.model.modelId)
              ? selected.effort
              : null
          }
          isMobile={isMobile}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
