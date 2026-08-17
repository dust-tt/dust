import type {
  UsageFilter,
  UsageFilterCategory,
} from "@app/components/workspace/analytics/usageFilter";
import { USAGE_FILTER_CATEGORY_LABEL } from "@app/components/workspace/analytics/usageFilter";
import {
  Counter,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
} from "@dust-tt/sparkle";

interface UsageFilterCategoryNavProps {
  categories: readonly UsageFilterCategory[];
  draftFilter: UsageFilter;
  activeCategory: UsageFilterCategory;
  onCategoryChange: (category: UsageFilterCategory) => void;
}

export function UsageFilterCategoryNav({
  categories,
  draftFilter,
  activeCategory,
  onCategoryChange,
}: UsageFilterCategoryNavProps) {
  return (
    <div className="flex h-full w-44 flex-col p-2">
      <NavigationListLabel
        label="Filter"
        className="bg-transparent pt-1.5 font-medium"
      />
      <NavigationList role="tablist" className="min-h-0 flex-1">
        {categories.map((category) => {
          const selectionCount = draftFilter[category]?.length ?? 0;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={category === activeCategory}
              className="w-full text-left"
              key={category}
              onClick={() => onCategoryChange(category)}
            >
              <NavigationListItem
                selected={category === activeCategory}
                avatar={
                  <span className="label-sm grow overflow-hidden text-ellipsis whitespace-nowrap primary-dark">
                    {USAGE_FILTER_CATEGORY_LABEL[category]}
                  </span>
                }
                suffix={
                  selectionCount > 0 ? (
                    <Counter
                      value={selectionCount}
                      size="xs"
                      variant="highlight"
                    />
                  ) : undefined
                }
              />
            </button>
          );
        })}
      </NavigationList>
    </div>
  );
}
