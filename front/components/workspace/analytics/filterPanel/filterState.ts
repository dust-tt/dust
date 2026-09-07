// Generic filter-selection state, shared by every analytics filter panel
// (consumption, automations, ...). Each panel picks its own category union
// and option shape; these helpers only assume `{id}`-shaped options keyed by
// a category.

import { removeDiacritics } from "@app/lib/utils";

export interface FilterOptionBase {
  id: string;
  name: string;
  disabled: boolean;
}

export type CategoryFilter<
  Category extends string,
  Option extends FilterOptionBase,
> = Partial<Record<Category, Option[]>>;

export interface FilterSummary<Category extends string> {
  category: Category;
  categoryLabel: string;
  options: Array<{ id: string; name: string }>;
}

export function filterOptionMatchesSearch(
  optionName: string,
  searchText: string
): boolean {
  const normalizedSearch = removeDiacritics(searchText.trim()).toLowerCase();

  return (
    !normalizedSearch ||
    removeDiacritics(optionName).toLowerCase().includes(normalizedSearch)
  );
}

export function getFilterSummaries<
  Category extends string,
  Option extends FilterOptionBase,
>(
  filter: CategoryFilter<Category, Option>,
  categories: readonly Category[],
  categoryLabels: Record<Category, string>
): FilterSummary<Category>[] {
  return categories.flatMap((category) => {
    const options = filter[category];
    if (!options?.length) {
      return [];
    }

    return [
      {
        category,
        categoryLabel: categoryLabels[category],
        options: options.map(({ id, name }) => ({ id, name })),
      },
    ];
  });
}

export function filterSelectionCount<
  Category extends string,
  Option extends FilterOptionBase,
>(
  filter: CategoryFilter<Category, Option>,
  categories: readonly Category[]
): number {
  return categories.reduce(
    (count, category) => count + (filter[category]?.length ?? 0),
    0
  );
}

export function toggleFilterOption<
  Category extends string,
  Option extends FilterOptionBase,
>(
  filter: CategoryFilter<Category, Option>,
  category: Category,
  option: Option
): CategoryFilter<Category, Option> {
  const current = filter[category] ?? [];
  const isSelected = current.some((e) => e.id === option.id);
  const next = isSelected
    ? current.filter((e) => e.id !== option.id)
    : [...current, option];
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function removeFilterOption<
  Category extends string,
  Option extends FilterOptionBase,
>(
  filter: CategoryFilter<Category, Option>,
  category: Category,
  id: string
): CategoryFilter<Category, Option> {
  const next = (filter[category] ?? []).filter((e) => e.id !== id);
  return { ...filter, [category]: next.length > 0 ? next : undefined };
}

export function clearFilterCategory<
  Category extends string,
  Option extends FilterOptionBase,
>(
  filter: CategoryFilter<Category, Option>,
  category: Category
): CategoryFilter<Category, Option> {
  return { ...filter, [category]: undefined };
}

export function selectAllFilterOptions<
  Category extends string,
  Option extends FilterOptionBase,
>(
  filter: CategoryFilter<Category, Option>,
  category: Category,
  options: Option[]
): CategoryFilter<Category, Option> {
  const current = filter[category] ?? [];
  const currentIds = new Set(current.map((e) => e.id));
  const additions = options.filter((e) => !currentIds.has(e.id));
  if (additions.length === 0) {
    return filter;
  }
  return { ...filter, [category]: [...current, ...additions] };
}
