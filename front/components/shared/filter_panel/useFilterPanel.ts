import type {
  CategoryFilter,
  FilterOptionBase,
} from "@app/components/shared/filter_panel/filterState";
import { useFilterDraft } from "@app/components/shared/filter_panel/useFilterDraft";
import { useState } from "react";

// Owned by the caller of `FilterPanel` rather than the panel itself, so that the caller can load
// the active category's options from the draft selections of the other categories.
export function useFilterPanel<
  Category extends string,
  Option extends FilterOptionBase,
>(filter: CategoryFilter<Category, Option>, categories: readonly Category[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>(
    categories[0]
  );
  const activeCategory = categories.includes(selectedCategory)
    ? selectedCategory
    : categories[0];
  const draft = useFilterDraft<Category, Option>(filter);

  return {
    isOpen,
    setIsOpen,
    activeCategory,
    setActiveCategory: setSelectedCategory,
    ...draft,
  };
}

export type FilterPanelState<
  Category extends string,
  Option extends FilterOptionBase,
> = ReturnType<typeof useFilterPanel<Category, Option>>;
