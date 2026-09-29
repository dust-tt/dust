import {
  FILTER_HASH_PARAM,
  parseFilterHash,
  serializeFilterHash,
} from "@app/components/shared/filter_panel/filterHash";
import type {
  SearchFilter,
  SearchFilterCategory,
  SearchFilterFacets,
  SearchFilterOption,
} from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterOptionKeys,
  resolveSearchFilterSelection,
  toSearchFilterSelection,
} from "@app/components/shared/filter_panel/searchFilter";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useMemo, useState } from "react";

// The search endpoints accept at most 100 IDs per filter.
const MAX_SELECTED_IDS = 100;

// Persists the selected tab and the selected filter IDs with their labels in the URL hash. Option
// names come from the options applied in this session; the caller resolves the others (restored
// from a link) through `resolveFilter`, from the facets of `unresolvedCategories`, and the stored
// labels name the IDs no facet holds.
// `categories` and `tabIds` must be referentially stable (module-level constants).
export function useSearchPageHashState<
  Category extends SearchFilterCategory,
  TabId extends string,
>({
  categories,
  tabIds,
  defaultTabId,
}: {
  categories: readonly Category[];
  tabIds: readonly TabId[];
  defaultTabId: TabId;
}) {
  const { user } = useAuth();
  const [value, setValue] = useHashParam(FILTER_HASH_PARAM);
  const { tabId, selection } = useMemo(
    () =>
      parseFilterHash(value, {
        categories,
        tabIds,
        defaultTabId,
        maxIdsPerCategory: MAX_SELECTED_IDS,
      }),
    [value, categories, tabIds, defaultTabId]
  );
  const [knownOptions, setKnownOptions] = useState<
    ReadonlyMap<string, SearchFilterOption>
  >(() => new Map());
  const resolve = (facets: SearchFilterFacets | undefined) =>
    resolveSearchFilterSelection({
      selection,
      categories,
      knownOptions,
      facets,
      currentUserId: user.sId,
    });
  const { filter, unresolvedCategories, unresolvedKeys } = resolve(undefined);

  const setSelectedTab = (nextTabId: TabId) =>
    setValue(
      serializeFilterHash({ tabId: nextTabId, selection }, defaultTabId)
    );

  const setFilter = (nextFilter: SearchFilter<Category>) => {
    // Unresolved placeholders are not remembered, so that their names are still looked up.
    setKnownOptions((previous) => {
      const next = new Map(previous);
      const options = Object.values<SearchFilterOption[] | undefined>(
        nextFilter
      ).flatMap((categoryOptions) => categoryOptions ?? []);
      for (const option of options) {
        for (const key of getSearchFilterOptionKeys(option)) {
          if (!unresolvedKeys.has(key)) {
            next.set(key, option);
          }
        }
      }
      return next;
    });
    setValue(
      serializeFilterHash(
        { tabId, selection: toSearchFilterSelection(nextFilter, categories) },
        defaultTabId
      )
    );
  };

  return {
    selectedTab: tabId,
    setSelectedTab,
    filter,
    setFilter,
    unresolvedCategories,
    resolveFilter: (facets: SearchFilterFacets | undefined) =>
      facets ? resolve(facets).filter : filter,
  };
}
