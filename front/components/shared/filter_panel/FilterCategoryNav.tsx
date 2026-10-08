import {
  Counter,
  cn,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

interface FilterCategoryNavProps<Category extends string> {
  categories: readonly Category[];
  categoryLabels: Record<Category, string>;
  selectionCounts: Partial<Record<Category, number>>;
  activeCategory: Category;
  onCategoryChange: (category: Category) => void;
  footer?: ReactNode;
  className?: string;
}

export function FilterCategoryNav<Category extends string>({
  categories,
  categoryLabels,
  selectionCounts,
  activeCategory,
  onCategoryChange,
  footer,
  className,
}: FilterCategoryNavProps<Category>) {
  const { t } = useLingui();

  return (
    <div className={cn("flex h-full min-w-44 flex-col p-2", className)}>
      <NavigationListLabel
        label={t({ message: "Filter", context: "noun, filter panel heading" })}
        className="bg-transparent pt-1.5 font-medium"
      />
      <NavigationList role="tablist" className="min-h-0 flex-1">
        {categories.map((category) => {
          const selectionCount = selectionCounts[category] ?? 0;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={category === activeCategory}
              className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              key={category}
              onClick={() => onCategoryChange(category)}
            >
              <NavigationListItem
                selected={category === activeCategory}
                avatar={
                  <span className="label-sm grow overflow-hidden text-ellipsis whitespace-nowrap primary-dark">
                    {categoryLabels[category]}
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
      {footer}
    </div>
  );
}
