import { useHashParam } from "@app/hooks/useHashParams";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

export type SearchPageQuery = Record<string, string | string[] | undefined>;

const SEARCH_HASH_PARAM = "filter";
const MAX_URL_LENGTH = 2_048;

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

const SearchPageQuerySchema = z.record(
  z.union([z.string(), z.array(z.string())])
);

export function searchPageQueryValues(
  value: SearchPageQuery[string]
): string[] {
  return QueryValuesSchema.parse(value);
}

function encodeSearchPageQuery(query: SearchPageQuery): string | undefined {
  const json = JSON.stringify(query);
  if (json === "{}") {
    return undefined;
  }
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    ""
  );
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function readSearchPageQuery(encoded: string | undefined): SearchPageQuery {
  if (!encoded || encoded.length > MAX_URL_LENGTH) {
    return {};
  }
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const result = SearchPageQuerySchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

function urlLengthWithFilter(encoded: string | undefined): number {
  const { pathname, search, hash } = window.location;
  const [prefix, query] = hash.slice(1).split("?");
  const params = new URLSearchParams(query);
  if (encoded) {
    params.set(SEARCH_HASH_PARAM, encoded);
  } else {
    params.delete(SEARCH_HASH_PARAM);
  }
  const hashQuery = params.toString();
  const nextHash = hashQuery
    ? `#${prefix}?${hashQuery}`
    : prefix
      ? `#${prefix}`
      : "";
  return `${pathname}${search}${nextHash}`.length;
}

interface SearchPageView<Filter> {
  searchTerm: string;
  selectedTab: string;
  filter: Filter;
  showHiddenAgents: boolean;
}

/**
 * @cc [owner:aubin-tchoi,label:product] search-page-url-state
 * Applied filters, search text and tab MUST survive reloads in a base64url
 * hash parameter. External hash changes and browser Back/Forward MUST update
 * the selection. Updates MUST replace history and preserve unrelated query
 * and hash parameters. If the URL exceeds 2,048 characters, omit the search
 * parameter while retaining its in-memory selection.
 */
/**
 * @cc [owner:aubin-tchoi,label:react] complete-filter-query
 * `filterQuery` MUST include every selected category as stable IDs so the
 * encoded selection restores all applied filters without display names.
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
  const [encoded, setEncoded] = useHashParam(SEARCH_HASH_PARAM);
  const readView = useCallback(
    (value: string | undefined): SearchPageView<Filter> => {
      const query = readSearchPageQuery(value);
      return {
        searchTerm: searchPageQueryValues(query.q)[0] ?? "",
        selectedTab:
          tabs.find(({ id }) => id === searchPageQueryValues(query.tab)[0])
            ?.id ?? tabs[0].id,
        filter: readFilter(query),
        showHiddenAgents:
          withHiddenAgents && searchPageQueryValues(query.hidden)[0] === "1",
      };
    },
    [tabs, readFilter, withHiddenAgents]
  );
  const [view, setView] = useState(() => readView(encoded));
  const viewRef = useRef(view);
  const writtenEncodedRef = useRef(encoded);

  useEffect(() => {
    if (encoded !== writtenEncodedRef.current) {
      const next = readView(encoded);
      writtenEncodedRef.current = encoded;
      viewRef.current = next;
      setView(next);
    }
  }, [encoded, readView]);

  const updateView = useCallback(
    (update: (current: SearchPageView<Filter>) => SearchPageView<Filter>) => {
      const next = update(viewRef.current);
      viewRef.current = next;
      setView(next);

      const query: SearchPageQuery = {
        q: next.searchTerm || undefined,
        tab: next.selectedTab === tabs[0].id ? undefined : next.selectedTab,
        ...filterQuery(next.filter),
        ...(withHiddenAgents
          ? { hidden: next.showHiddenAgents ? "1" : undefined }
          : {}),
      };
      const value = encodeSearchPageQuery(query);
      const safeValue =
        urlLengthWithFilter(value) <= MAX_URL_LENGTH ? value : undefined;
      writtenEncodedRef.current = safeValue;
      setEncoded(safeValue);
    },
    [filterQuery, setEncoded, tabs, withHiddenAgents]
  );

  const setSearchTerm = useCallback(
    (searchTerm: string) =>
      updateView((current) => ({ ...current, searchTerm })),
    [updateView]
  );
  const setSelectedTab = useCallback(
    (selectedTab: string) =>
      updateView((current) => ({ ...current, selectedTab })),
    [updateView]
  );
  const setFilter = useCallback(
    (filter: Filter) => updateView((current) => ({ ...current, filter })),
    [updateView]
  );
  const setShowHiddenAgents = useCallback(
    (showHiddenAgents: boolean) =>
      updateView((current) => ({ ...current, showHiddenAgents })),
    [updateView]
  );

  return {
    ...view,
    setSearchTerm,
    setSelectedTab,
    setFilter,
    setShowHiddenAgents,
  };
}
