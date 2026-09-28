import { getIcon } from "@app/components/resources/resources_icons";
import { FilterPanel } from "@app/components/shared/filter_panel/FilterPanel";
import type {
  SearchFilter,
  SearchFilterCategory,
  SearchFilterFacets,
  SearchFilterOption,
} from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterOptions,
  SEARCH_FILTER_CATEGORY_LABEL,
} from "@app/components/shared/filter_panel/searchFilter";
import type { FilterPanelState } from "@app/components/shared/filter_panel/useFilterPanel";
import { useAuth } from "@app/lib/auth/AuthContext";
import { Avatar, Icon } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

function renderOptionIcon(option: SearchFilterOption) {
  switch (option.category) {
    case "editor":
      return (
        <Avatar visual={option.image} name={option.name} size="xxs" isRounded />
      );
    case "tool":
      return <Icon visual={getIcon(option.icon)} size="sm" />;
    default:
      return null;
  }
}

interface SearchFilterPanelProps<Category extends SearchFilterCategory> {
  panel: FilterPanelState<Category, SearchFilterOption>;
  categories: readonly Category[];
  filter: SearchFilter<Category>;
  onFilterChange: (filter: SearchFilter<Category>) => void;
  // Facet values of the active category, loaded by the caller from its own search.
  facets: SearchFilterFacets | undefined;
  isLoading: boolean;
  isError: boolean;
  idPrefix: string;
  warning?: string;
  applyDisabled?: boolean;
  categoryNavFooter?: ReactNode;
  onOpen?: () => void;
}

export function SearchFilterPanel<Category extends SearchFilterCategory>({
  panel,
  categories,
  filter,
  onFilterChange,
  facets,
  isLoading,
  isError,
  idPrefix,
  warning,
  applyDisabled,
  categoryNavFooter,
  onOpen,
}: SearchFilterPanelProps<Category>) {
  const { user } = useAuth();

  return (
    <FilterPanel
      panel={panel}
      categories={categories}
      categoryLabels={SEARCH_FILTER_CATEGORY_LABEL}
      filter={filter}
      onFilterChange={onFilterChange}
      activeCategoryOptions={getSearchFilterOptions(
        panel.activeCategory,
        facets,
        user.sId
      )}
      status={isLoading ? "loading" : "idle"}
      isError={isError}
      idPrefix={idPrefix}
      renderIcon={renderOptionIcon}
      warning={warning}
      applyDisabled={applyDisabled}
      categoryNavFooter={categoryNavFooter}
      onOpen={onOpen}
    />
  );
}
