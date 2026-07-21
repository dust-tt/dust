import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import { ModelPickerProviderSection } from "@app/components/assistant/conversation/input_bar/ModelPickerProviderSection";
import { ModelPickerSubTrigger } from "@app/components/assistant/conversation/input_bar/ModelPickerSubTrigger";
import type {
  MakerGroup,
  ModelWithReasoningEffort,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelWithReasoningEffortKey } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
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
  // Flat list of every model/effort filtered by the search string (used while
  // searching).
  filteredModels: ModelWithReasoningEffort[];
  moreByMaker: MakerGroup[];
  selectedKey?: string;
  // The model line that carries the "(Default)" marker, when the default is a
  // non-tier model surfaced here.
  defaultModelKey?: string;
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
}

// The body of the "More models" section: a search bar over every model, then
// either the flat search results or the per-maker list. Rendered inside a
// submenu on desktop and inline under the "More models" row on mobile.
export function MoreModelsPanel({
  search,
  onSearchChange,
  filteredModels,
  moreByMaker,
  selectedKey,
  defaultModelKey,
  canRevert,
  onRevert,
  selectedMakerId,
  onSelectModel,
  isMobile,
  expandProvidersInline,
  expandedMaker,
  onToggleMaker,
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
          filteredModels.map((modelWithEffort) => (
            <ModelPickerLineItem
              key={getModelWithReasoningEffortKey(
                modelWithEffort.model.providerId,
                modelWithEffort.model.modelId,
                modelWithEffort.effort
              )}
              modelWithEffort={modelWithEffort}
              isMobile={isMobile}
              selectedKey={selectedKey}
              defaultModelKey={defaultModelKey}
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
                  selectedKey={selectedKey}
                  defaultModelKey={defaultModelKey}
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
              <DropdownMenuSubContent>
                <ModelPickerProviderSection
                  maker={maker}
                  selectedKey={selectedKey}
                  defaultModelKey={defaultModelKey}
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
