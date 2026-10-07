import { getIcon } from "@app/components/resources/resources_icons";
import { FilterPanel } from "@app/components/shared/filter_panel/FilterPanel";
import {
  clearFilterCategory,
  selectAllFilterOptions,
} from "@app/components/shared/filter_panel/filterState";
import type {
  SearchFilter,
  SearchFilterCategory,
  SearchFilterFacets,
  SearchFilterOption,
} from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterActiveUsersCount,
  getSearchFilterCategoryLabels,
  getSearchFilterSearchPlaceholders,
  getSearchFilterOptions,
  toUsageFilterOption,
} from "@app/components/shared/filter_panel/searchFilter";
import { UsageRangeFilter } from "@app/components/shared/filter_panel/UsageRangeFilter";
import type { FilterPanelState } from "@app/components/shared/filter_panel/useFilterPanel";
import { useAuth } from "@app/lib/auth/AuthContext";
import { getSkillIcon } from "@app/lib/skill";
import { Avatar, Icon } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useMemo } from "react";

function renderOptionIcon(option: SearchFilterOption) {
  switch (option.category) {
    case "editor":
      return (
        <Avatar visual={option.image} name={option.name} size="xxs" isRounded />
      );
    case "skill":
      return <Icon visual={getSkillIcon(option.icon)} size="sm" />;
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
  onClearAll?: () => void;
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
  onClearAll,
}: SearchFilterPanelProps<Category>) {
  const { t } = useLingui();
  const { user } = useAuth();
  const categoryLabels = useMemo(() => getSearchFilterCategoryLabels(t), [t]);
  const searchPlaceholders = useMemo(
    () => getSearchFilterSearchPlaceholders(t),
    [t]
  );

  return (
    <FilterPanel
      panel={panel}
      categories={categories}
      categoryLabels={categoryLabels}
      searchPlaceholders={searchPlaceholders}
      filter={filter}
      onFilterChange={onFilterChange}
      activeCategoryOptions={getSearchFilterOptions(
        panel.activeCategory,
        facets,
        user.sId,
        t
      )}
      status={isLoading ? "loading" : "idle"}
      isError={isError}
      idPrefix={idPrefix}
      renderIcon={renderOptionIcon}
      renderCategoryContent={(category) =>
        category === "usage" && (
          <UsageRangeFilter
            bounds={facets?.usage}
            selected={getSearchFilterActiveUsersCount(panel.draftFilter)}
            isLoading={isLoading}
            onChange={(range) =>
              panel.setDraftFilter((draft) => {
                const cleared = clearFilterCategory(draft, category);
                return range
                  ? selectAllFilterOptions(cleared, category, [
                      toUsageFilterOption(range, t),
                    ])
                  : cleared;
              })
            }
          />
        )
      }
      warning={warning}
      applyDisabled={applyDisabled}
      categoryNavFooter={categoryNavFooter}
      onOpen={onOpen}
      onClearAll={onClearAll}
    />
  );
}
