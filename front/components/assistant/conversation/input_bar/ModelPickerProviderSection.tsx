import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import type {
  MakerGroup,
  ModelRef,
  ModelWithReasoningEffort,
  SelectedModelRef,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { modelRefMatches } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";

interface ModelPickerProviderSectionProps {
  maker: MakerGroup;
  // The current selection's model + effort, when it lives in "More models".
  selectedModel: SelectedModelRef | null;
  // The model the selection reverts to, when the default is surfaced here.
  defaultModel: ModelRef | null;
  canRevert: boolean;
  onRevert: () => void;
  isMobile: boolean;
  onSelect: (modelWithEffort: ModelWithReasoningEffort) => void;
}

// The models offered by a maker: one row per model. Selecting a row reveals its
// reasoning-effort slider. Rendered inside a submenu on desktop and inline under
// the maker name on mobile.
export function ModelPickerProviderSection({
  maker,
  selectedModel,
  defaultModel,
  canRevert,
  onRevert,
  isMobile,
  onSelect,
}: ModelPickerProviderSectionProps) {
  return (
    <>
      {maker.models.map((entry) => (
        <ModelPickerLineItem
          key={entry.model.modelId}
          model={entry.model}
          efforts={entry.efforts}
          isMobile={isMobile}
          selectedEffort={
            modelRefMatches(selectedModel, entry.model)
              ? (selectedModel?.effort ?? null)
              : null
          }
          isDefaultModel={modelRefMatches(defaultModel, entry.model)}
          canRevert={canRevert}
          onRevert={onRevert}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
