import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { FILTER_PICKER_PAGE_SIZE } from "@app/components/workspace/analytics/filterPanel/constants";
import { FilterAvailabilityStatus } from "@app/components/workspace/analytics/filterPanel/FilterAvailabilityStatus";
import type { FilterOptionBase } from "@app/components/workspace/analytics/filterPanel/filterState";
import { UsageFilterSection } from "@app/components/workspace/analytics/usageFilterPanel/UsageFilterSection";
import {
  Button,
  Checkbox,
  Label,
  LoadingBlock,
  Spinner,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useState } from "react";

function FilterOptionListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-0.5">
      {["w-24", "w-32", "w-20", "w-36", "w-28", "w-24"].map((width, index) => (
        <div key={index} className="flex items-center gap-2 px-2 py-1">
          <LoadingBlock className="h-4 w-4 shrink-0 rounded" />
          <LoadingBlock className="h-4 w-4 shrink-0 rounded" />
          <LoadingBlock className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  );
}

export type FilterOptionListStatus =
  | "idle"
  | "loading"
  | "loading-more"
  | "updating";

interface FilterOptionCheckboxListProps<Option extends FilterOptionBase> {
  idPrefix: string;
  categoryLabel: string;
  options: Option[];
  selectedIds: Set<string>;
  onToggleOption: (option: Option) => void;
  onSelectAll: () => void;
  selectAllLabel: string;
  hasSelectableOptions: boolean;
  renderIcon?: (option: Option) => ReactNode;
  status?: FilterOptionListStatus;
  scrollContainer: HTMLDivElement | null;
}

export function FilterOptionCheckboxList<Option extends FilterOptionBase>({
  idPrefix,
  categoryLabel,
  options,
  selectedIds,
  onToggleOption,
  onSelectAll,
  selectAllLabel,
  hasSelectableOptions,
  renderIcon,
  status = "idle",
  scrollContainer,
}: FilterOptionCheckboxListProps<Option>) {
  const isLoading = status === "loading";
  const isUpdating = status === "updating";
  const isLoadingMore = status === "loading-more";
  // Reset on category/search/scope change by remounting this component with
  // a fresh `key` from the parent instead of tracking a reset key here.
  const [visibleCount, setVisibleCount] = useState(FILTER_PICKER_PAGE_SIZE);
  const displayedOptions = options.slice(0, visibleCount);
  const hasMore = visibleCount < options.length;
  const loadMore = () =>
    setVisibleCount((current) => current + FILTER_PICKER_PAGE_SIZE);
  return (
    <UsageFilterSection
      title={`All ${categoryLabel}`}
      action={
        <div className="flex items-center gap-2">
          {isUpdating && (
            <span className="text-xs text-muted-foreground">Updating…</span>
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
    >
      <div
        aria-busy={isLoading || isUpdating}
        className="flex flex-col gap-0.5"
      >
        {isLoading && options.length === 0 ? (
          <FilterOptionListSkeleton />
        ) : displayedOptions.length > 0 ? (
          <>
            {displayedOptions.map((option) => {
              const checked = selectedIds.has(option.id);
              const disabled = option.disabled && !checked;
              const checkboxId = `${idPrefix}-${option.id}`;
              const availabilityDescriptionId = option.disabled
                ? `${checkboxId}-availability`
                : undefined;
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-2 px-2 py-1"
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
                  {renderIcon?.(option)}
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
                    <FilterAvailabilityStatus id={availabilityDescriptionId} />
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
    </UsageFilterSection>
  );
}
