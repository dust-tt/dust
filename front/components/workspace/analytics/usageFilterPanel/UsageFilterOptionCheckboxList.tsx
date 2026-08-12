import { InfiniteScroll } from "@app/components/InfiniteScroll";
import type {
  UsageFilterCategory,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import { FILTER_PICKER_PAGE_SIZE } from "@app/components/workspace/analytics/usageFilterPanel/constants";
import { UsageFilterAvailabilityStatus } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterAvailabilityStatus";
import { UsageFilterOptionIcon } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterOptionIcon";
import {
  Button,
  Checkbox,
  Label,
  NavigationListLabel,
  Spinner,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface UsageFilterOptionCheckboxListProps {
  category: UsageFilterCategory;
  categoryLabel: string;
  options: UsageFilterOption[];
  selectedIds: Set<string>;
  onToggleOption: (option: UsageFilterOption) => void;
  onSelectAll: () => void;
  selectAllLabel: string;
  hasSelectableOptions: boolean;
  isSelectionLimitReached: boolean;
  isLoadingMore?: boolean;
  isLoading?: boolean;
  isUpdating?: boolean;
}

export function UsageFilterOptionCheckboxList({
  category,
  categoryLabel,
  options,
  selectedIds,
  onToggleOption,
  onSelectAll,
  selectAllLabel,
  hasSelectableOptions,
  isSelectionLimitReached,
  isLoadingMore = false,
  isLoading = false,
  isUpdating = false,
}: UsageFilterOptionCheckboxListProps) {
  // Tracked as state so InfiniteScroll re-renders once the node
  // mounts and can attach its scroll listener directly to it.
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );
  // Reset on category/search/scope change by remounting this component with
  // a fresh `key` from the parent instead of tracking a reset key here.
  const [visibleCount, setVisibleCount] = useState(FILTER_PICKER_PAGE_SIZE);
  const displayedOptions = options.slice(0, visibleCount);
  const hasMore = visibleCount < options.length;
  const loadMore = () =>
    setVisibleCount((current) => current + FILTER_PICKER_PAGE_SIZE);
  return (
    <>
      <NavigationListLabel
        label={`All ${categoryLabel}`}
        className="bg-transparent font-medium"
        action={
          <div className="flex items-center gap-2">
            {isUpdating && (
              <span className="text-xs text-muted-foreground">Updating…</span>
            )}
            {isSelectionLimitReached && !isUpdating && (
              <span className="text-xs text-muted-foreground">
                Selection limit reached
              </span>
            )}
            <Button
              label={selectAllLabel}
              size="xmini"
              variant="ghost-secondary"
              onClick={onSelectAll}
              disabled={!hasSelectableOptions || isUpdating}
            />
          </div>
        }
      />
      <div
        ref={setScrollContainer}
        aria-busy={isUpdating}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      >
        {isLoading && options.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner size="xs" />
          </div>
        ) : displayedOptions.length > 0 ? (
          <>
            {displayedOptions.map((option) => {
              const checked = selectedIds.has(option.id);
              const disabled =
                (option.disabled || isSelectionLimitReached) && !checked;
              const checkboxId = `usage-filter-option-${category}-${option.id}`;
              const availabilityDescriptionId = option.disabled
                ? `${checkboxId}-availability`
                : undefined;
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-2 py-1 pl-1 pr-2"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    aria-disabled={disabled}
                    aria-describedby={availabilityDescriptionId}
                    className={
                      disabled ? "cursor-default opacity-50" : undefined
                    }
                    onCheckedChange={() => {
                      if (!disabled) {
                        onToggleOption(option);
                      }
                    }}
                  />
                  <UsageFilterOptionIcon option={option} />
                  <Label
                    htmlFor={checkboxId}
                    className={
                      disabled
                        ? "min-w-0 flex-1 cursor-default text-sm leading-none text-muted-foreground peer-disabled:cursor-default"
                        : "min-w-0 flex-1 cursor-pointer text-sm leading-none"
                    }
                  >
                    <span className="block truncate">{option.name}</span>
                  </Label>
                  {option.disabled && (
                    <UsageFilterAvailabilityStatus
                      id={availabilityDescriptionId}
                    />
                  )}
                </div>
              );
            })}
            {hasMore && (
              <InfiniteScroll
                nextPage={loadMore}
                hasMore={hasMore}
                showLoader={isLoadingMore}
                loader={
                  <div className="flex justify-center py-2">
                    <Spinner size="xs" />
                  </div>
                }
                options={{
                  root: scrollContainer,
                  rootMargin: "0px 0px 100px 0px",
                }}
              />
            )}
          </>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No results
          </div>
        )}
      </div>
    </>
  );
}
