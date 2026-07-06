import { ModelPickerLineItem } from "@app/components/assistant/conversation/input_bar/ModelPickerLineItem";
import { ModelPickerProviderSection } from "@app/components/assistant/conversation/input_bar/ModelPickerProviderSection";
import { ModelPickerRowTooltip } from "@app/components/assistant/conversation/input_bar/ModelPickerRowTooltip";
import type {
  ModelLine,
  ProviderGroup,
  SuggestedLine,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import {
  AUTO_TOOLTIP,
  getLineKey,
} from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { getModelProviderLogo } from "@app/components/providers/types";
import { getProviderDisplayName } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  ChevronDown,
  ChevronRight,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Icon,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import { Fragment } from "react";

interface ModelPickerContentProps {
  side: "top" | "bottom";
  search: string;
  onSearchChange: (value: string) => void;
  isModelsLoading: boolean;
  isSearching: boolean;
  hasResults: boolean;
  filteredAll: ModelLine[];
  suggestedLines: SuggestedLine[];
  moreByProvider: ProviderGroup[];
  selectedKey?: string;
  isMobile: boolean;
  isDark: boolean;
  showAuto: boolean;
  isAutoOn: boolean;
  showList: boolean;
  onToggleAuto: () => void;
  onSelectLine: (line: ModelLine) => void;
  // On mobile the "More models" providers expand inline; this tracks the single
  // provider currently expanded.
  expandedProvider: ModelProviderIdType | null;
  onToggleProvider: (providerId: ModelProviderIdType) => void;
}

export function ModelPickerContent({
  side,
  search,
  onSearchChange,
  isModelsLoading,
  isSearching,
  hasResults,
  filteredAll,
  suggestedLines,
  moreByProvider,
  selectedKey,
  isMobile,
  isDark,
  showAuto,
  isAutoOn,
  showList,
  onToggleAuto,
  onSelectLine,
  expandedProvider,
  onToggleProvider,
}: ModelPickerContentProps) {
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

      {showAuto && (
        <ModelPickerRowTooltip description={AUTO_TOOLTIP} isMobile={isMobile}>
          <DropdownMenuItem
            label="Auto"
            endComponent={<SliderToggle size="xs" selected={isAutoOn} />}
            onClick={onToggleAuto}
            onSelect={(e) => e.preventDefault()}
          />
        </ModelPickerRowTooltip>
      )}

      {showList &&
        (isModelsLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : !hasResults ? (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
            No models found
          </div>
        ) : isSearching ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={selectedKey}>
              {filteredAll.map((line) => (
                <ModelPickerLineItem
                  key={getLineKey(
                    line.model.providerId,
                    line.model.modelId,
                    line.effort
                  )}
                  line={line}
                  isMobile={isMobile}
                  onSelect={onSelectLine}
                />
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : (
          <>
            {suggestedLines.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel label="Suggested" />
                <DropdownMenuRadioGroup value={selectedKey}>
                  {suggestedLines.map((line) => (
                    <ModelPickerLineItem
                      key={getLineKey(
                        line.model.providerId,
                        line.model.modelId,
                        line.effort
                      )}
                      line={line}
                      isMobile={isMobile}
                      onSelect={onSelectLine}
                      recommendation={line.recommendation}
                    />
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
            {moreByProvider.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel label="More models" />
                {moreByProvider.map((provider) =>
                  isMobile ? (
                    // On mobile the provider expands inline below its name
                    // instead of opening a nested submenu (which is awkward to
                    // reach on touch).
                    <Fragment key={provider.providerId}>
                      <DropdownMenuItem
                        label={getProviderDisplayName(provider.providerId)}
                        icon={getModelProviderLogo(provider.providerId, isDark)}
                        endComponent={
                          <Icon
                            visual={
                              expandedProvider === provider.providerId
                                ? ChevronDown
                                : ChevronRight
                            }
                            size="xs"
                          />
                        }
                        onClick={() => onToggleProvider(provider.providerId)}
                        onSelect={(e) => e.preventDefault()}
                      />
                      {expandedProvider === provider.providerId && (
                        <ModelPickerProviderSection
                          provider={provider}
                          selectedKey={selectedKey}
                          isMobile={isMobile}
                          onSelect={onSelectLine}
                        />
                      )}
                    </Fragment>
                  ) : (
                    <DropdownMenuSub key={provider.providerId}>
                      <DropdownMenuSubTrigger
                        label={getProviderDisplayName(provider.providerId)}
                        icon={getModelProviderLogo(provider.providerId, isDark)}
                      />
                      <DropdownMenuSubContent>
                        <ModelPickerProviderSection
                          provider={provider}
                          selectedKey={selectedKey}
                          isMobile={isMobile}
                          onSelect={onSelectLine}
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )
                )}
              </>
            )}
          </>
        ))}
    </DropdownMenuContent>
  );
}
