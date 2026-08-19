import {
  Counter,
  NavigationList,
  NavigationListItem,
  NavigationListLabel,
} from "@dust-tt/sparkle";

interface FilterCategoryNavProps<Category extends string> {
  categories: readonly Category[];
  categoryLabels: Record<Category, string>;
  selectionCounts: Partial<Record<Category, number>>;
  activeCategory: Category;
  onCategoryChange: (category: Category) => void;
}

export function FilterCategoryNav<Category extends string>({
  categories,
  categoryLabels,
  selectionCounts,
  activeCategory,
  onCategoryChange,
}: FilterCategoryNavProps<Category>) {
  return (
    <div className="flex h-full w-44 flex-col p-2">
      <NavigationListLabel
        label="Filter"
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
              className="w-full text-left"
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
    </div>
  );
}
