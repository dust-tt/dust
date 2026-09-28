import { useAppRouter } from "@app/lib/platform";
import { useEffect, useState } from "react";
import { z } from "zod";

export type SearchPageQuery = Record<string, string | string[] | undefined>;

const QueryValuesSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    [
      ...new Set(
        (Array.isArray(value) ? value : [value]).filter(
          (item): item is string => item !== undefined && item.length > 0
        )
      ),
    ].slice(0, 100)
  );

export function searchPageQueryValues(
  value: SearchPageQuery[string]
): string[] {
  return QueryValuesSchema.parse(value);
}

function queryString(query: SearchPageQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) {
        params.append(key, item);
      }
    }
  }
  return params.toString();
}

/**
 * @cc [owner:aubin-tchoi,label:product] search-page-url-state
 * Applied filters, search text and tab MUST survive a reload. Updates MUST
 * replace history and preserve unrelated query parameters and the hash.
 * If the URL exceeds 2,048 characters, omit the search page's parameters
 * while retaining its in-memory selection.
 */
/**
 * @cc [owner:aubin-tchoi,label:react] complete-filter-query
 * `filterQuery` MUST include every query parameter it owns, including empty
 * selections, so clearing a filter removes its previous URL value.
 */
export function useSearchPageState<Filter>({
  tabs,
  readFilter,
  filterQuery,
  withHiddenAgents = false,
}: {
  tabs: { id: string }[];
  readFilter: (query: SearchPageQuery) => Filter;
  filterQuery: (filter: Filter) => SearchPageQuery;
  withHiddenAgents?: boolean;
}) {
  const router = useAppRouter();
  const [searchTerm, setSearchTerm] = useState(
    () => searchPageQueryValues(router.query.q)[0] ?? ""
  );
  const [selectedTab, setSelectedTab] = useState(
    () =>
      tabs.find(({ id }) => id === searchPageQueryValues(router.query.tab)[0])
        ?.id ?? tabs[0].id
  );
  const [filter, setFilter] = useState(() => readFilter(router.query));
  const [showHiddenAgents, setShowHiddenAgents] = useState(
    () =>
      withHiddenAgents && searchPageQueryValues(router.query.hidden)[0] === "1"
  );

  useEffect(() => {
    const ownedQuery: SearchPageQuery = {
      q: searchTerm || undefined,
      tab: selectedTab === tabs[0].id ? undefined : selectedTab,
      ...filterQuery(filter),
      ...(withHiddenAgents
        ? { hidden: showHiddenAgents ? "1" : undefined }
        : {}),
    };
    const nextQuery = { ...router.query, ...ownedQuery };
    const hash = window.location.hash;
    if (`${router.pathname}?${queryString(nextQuery)}${hash}`.length > 2_048) {
      for (const key of Object.keys(ownedQuery)) {
        nextQuery[key] = undefined;
      }
    }
    if (
      Object.keys(ownedQuery).every(
        (key) =>
          queryString({ [key]: router.query[key] }) ===
          queryString({ [key]: nextQuery[key] })
      )
    ) {
      return;
    }
    void router.replace(
      { pathname: router.pathname, query: nextQuery, hash },
      undefined,
      { shallow: true }
    );
  }, [
    router,
    searchTerm,
    selectedTab,
    filter,
    filterQuery,
    tabs,
    withHiddenAgents,
    showHiddenAgents,
  ]);

  return {
    searchTerm,
    setSearchTerm,
    selectedTab,
    setSelectedTab,
    filter,
    setFilter,
    showHiddenAgents,
    setShowHiddenAgents,
  };
}
