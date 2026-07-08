import { ModelPickerList } from "@app/components/assistant/conversation/input_bar/ModelPickerList";
import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type {
  ModelPickerListState,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { AUTO_TOOLTIP } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  SliderToggle,
} from "@dust-tt/sparkle";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  search: string;
  onSearchChange: (value: string) => void;
  listState: ModelPickerListState;
  // The Auto row: null hides it entirely (e.g. while searching), otherwise
  // `isOn` drives the toggle state.
  auto: { isOn: boolean } | null;
  selectedKey?: string;
  onToggleAuto: () => void;
  onSelectModel: (modelWithEffort: ModelWithReasoningEffort) => void;
  // On mobile the "More models" providers expand inline; this tracks the single
  // provider currently expanded.
  expandedProvider: ModelProviderIdType | null;
  onToggleProvider: (providerId: ModelProviderIdType) => void;
}

export function ModelPickerContent({
  side,
  search,
  onSearchChange,
  listState,
  auto,
  selectedKey,
  onToggleAuto,
  onSelectModel,
  expandedProvider,
  onToggleProvider,
}: ModelPickerContentProps) {
  const isMobile = useIsMobile();

  return (
    <DropdownMenuContent className="w-72" align="start" side={side}>
      <div className="sticky top-0 z-10 bg-overlay-background pb-1">
        <DropdownMenuSearchbar
          autoFocus={!isMobile}
          name="search-models"
          placeholder="Search models"
          value={search}
          onChange={onSearchChange}
        />
      </div>

      {auto && (
        <ModelPickerRowTooltip description={AUTO_TOOLTIP} isMobile={isMobile}>
          <DropdownMenuItem
            label="Auto"
            endComponent={<SliderToggle selected={auto.isOn} />}
            onClick={onToggleAuto}
            onSelect={(e) => e.preventDefault()}
          />
        </ModelPickerRowTooltip>
      )}

      <ModelPickerList
        listState={listState}
        selectedKey={selectedKey}
        onSelectModel={onSelectModel}
        expandedProvider={expandedProvider}
        onToggleProvider={onToggleProvider}
      />
    </DropdownMenuContent>
  );
}
