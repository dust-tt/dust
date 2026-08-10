import { InfiniteScroll } from "@app/components/InfiniteScroll";
import type {
  UsageFilterCategory,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
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
  // Only set for categories backed by a paginated server fetch (members).
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export function UsageFilterOptionCheckboxList({
  category,
  categoryLabel,
  options,
  selectedIds,
  onToggleOption,
  onSelectAll,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: UsageFilterOptionCheckboxListProps) {
  // Tracked as state (not a ref) so InfiniteScroll re-renders once the node
  // mounts and can attach its scroll listener directly to it — passing this
  // as an explicit root is what the InfiniteScroll component recommends,
  // since its IntersectionObserver-sentinel fallback doesn't reliably fire
  // for a nested scroll container like this one.
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null
  );

  return (
    <>
      <NavigationListLabel
        label={`All ${categoryLabel}`}
        className="bg-transparent font-medium"
        action={
          <Button
            label="Select all"
            size="xmini"
            variant="ghost-secondary"
            onClick={onSelectAll}
            disabled={options.length === 0}
          />
        }
      />
      <div
        ref={setScrollContainer}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      >
        {options.length > 0 ? (
          <>
            {options.map((option) => {
              const checked = selectedIds.has(option.id);
              const checkboxId = `usage-filter-option-${category}-${option.id}`;
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-2 py-1 pl-1 pr-2"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    onCheckedChange={() => onToggleOption(option)}
                  />
                  <UsageFilterOptionIcon option={option} />
                  <Label
                    htmlFor={checkboxId}
                    className="cursor-pointer text-sm leading-none"
                  >
                    {option.name}
                  </Label>
                </div>
              );
            })}
            {onLoadMore && (
              <InfiniteScroll
                nextPage={onLoadMore}
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
