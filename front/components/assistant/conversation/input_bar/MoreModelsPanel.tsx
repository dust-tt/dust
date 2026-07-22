import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import { ModelPickerProviderSection } from "@app/components/assistant/conversation/input_bar/ModelPickerProviderSection";
import { ModelPickerSubTrigger } from "@app/components/assistant/conversation/input_bar/ModelPickerSubTrigger";
import type {
  MakerGroup,
  ModelEntry,
  ModelRef,
  ModelWithReasoningEffort,
  SelectedModelRef,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { modelRefMatches } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getModelMakerDisplayName } from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  Check,
  ChevronDown,
  ChevronRight,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuSub,
  DropdownMenuSubContent,
  Icon,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface MoreModelsPanelProps {
  search: string;
  onSearchChange: (value: string) => void;
  // Flat list of every model (with its supported efforts) filtered by the
  // search string (used while searching).
  filteredModels: ModelEntry[];
  moreByMaker: MakerGroup[];
  // The current selection's model + effort, when it lives in "More models".
  selectedModel: SelectedModelRef | null;
  // The model line that carries the "(Default)" marker, when the default is a
  // non-tier model surfaced here.
  defaultModel: ModelRef | null;
  // The selected model's check turns into a clickable X on hover to revert to
  // the default.
  canRevert: boolean;
  onRevert: () => void;
  // The maker of the current selection, when it lives in the "More models"
  // list: its provider row shows a check so the path to the model is visible.
  selectedMakerId: ModelMakerIdType | null;
  onSelectModel: (modelWithEffort: ModelWithReasoningEffort) => void;
  isMobile: boolean;
  // On width-constrained clients (mobile, extension) makers expand inline
  // instead of opening a nested submenu.
  expandProvidersInline: boolean;
  expandedMaker: ModelMakerIdType | null;
  onToggleMaker: (makerId: ModelMakerIdType) => void;
  // Vetoes the focus-outside dismissal that a model/effort pick triggers on the
  // maker submenu, so the effort slider stays reachable after a pick.
  shouldBlockDismiss: () => boolean;
}

// The body of the "More models" section: a search bar over every model, then
// either the flat search results or the per-maker list. Rendered inside a
// submenu on desktop and inline under the "More models" row on mobile.
export function MoreModelsPanel({
  search,
  onSearchChange,
  filteredModels,
  moreByMaker,
  selectedModel,
  defaultModel,
  canRevert,
  onRevert,
  selectedMakerId,
  onSelectModel,
  isMobile,
  expandProvidersInline,
  expandedMaker,
  onToggleMaker,
  shouldBlockDismiss,
}: MoreModelsPanelProps) {
  const { isDark } = useTheme();
  const isSearching = search.trim() !== "";

  return (
    <>
      <div className="sticky top-0 z-10 bg-overlay-background pb-2">
        <DropdownMenuSearchbar
          autoFocus={!isMobile}
          name="search-models"
          placeholder="Search for model"
          value={search}
          onChange={onSearchChange}
        />
      </div>

      {isSearching ? (
        filteredModels.length > 0 ? (
          filteredModels.map((entry) => (
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
              onSelect={onSelectModel}
            />
          ))
        ) : (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
            No models found
          </div>
        )
      ) : (
        moreByMaker.map((maker) =>
          expandProvidersInline ? (
            <Fragment key={maker.makerId}>
              <DropdownMenuItem
                label={getModelMakerDisplayName(maker.makerId)}
                icon={getModelMakerLogo(maker.makerId, isDark)}
                endComponent={
                  <span className="flex items-center gap-2">
                    {maker.makerId === selectedMakerId && (
                      <Icon visual={Check} size="xs" />
                    )}
                    <Icon
                      visual={
                        expandedMaker === maker.makerId
                          ? ChevronDown
                          : ChevronRight
                      }
                      size="xs"
                    />
                  </span>
                }
                onClick={() => onToggleMaker(maker.makerId)}
                onSelect={(e) => e.preventDefault()}
              />
              {expandedMaker === maker.makerId && (
                <ModelPickerProviderSection
                  maker={maker}
                  selectedModel={selectedModel}
                  defaultModel={defaultModel}
                  canRevert={canRevert}
                  onRevert={onRevert}
                  isMobile={isMobile}
                  onSelect={onSelectModel}
                />
              )}
            </Fragment>
          ) : (
            <DropdownMenuSub key={maker.makerId}>
              <ModelPickerSubTrigger
                label={getModelMakerDisplayName(maker.makerId)}
                icon={getModelMakerLogo(maker.makerId, isDark)}
                checked={maker.makerId === selectedMakerId}
              />
              <DropdownMenuSubContent
                className="w-72"
                onFocusOutside={(e) => {
                  if (shouldBlockDismiss()) {
                    e.preventDefault();
                  }
                }}
                onPointerDownOutside={(e) => {
                  if (shouldBlockDismiss()) {
                    e.preventDefault();
                  }
                }}
                onInteractOutside={(e) => {
                  if (shouldBlockDismiss()) {
                    e.preventDefault();
                  }
                }}
              >
                <ModelPickerProviderSection
                  maker={maker}
                  selectedModel={selectedModel}
                  defaultModel={defaultModel}
                  canRevert={canRevert}
                  onRevert={onRevert}
                  isMobile={isMobile}
                  onSelect={onSelectModel}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        )
      )}
    </>
  );
}
