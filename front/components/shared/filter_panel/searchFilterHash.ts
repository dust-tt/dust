import type {
  SearchFilter,
  SearchFilterCategory,
  SearchFilterFacets,
  SearchFilterOption,
  SearchFilterSelection,
} from "@app/components/shared/filter_panel/searchFilter";
import {
  getSearchFilterOptionKeys,
  resolveSearchFilterSelection,
  toSearchFilterSelection,
} from "@app/components/shared/filter_panel/searchFilter";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth } from "@app/lib/auth/AuthContext";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { useMemo, useState } from "react";
import { z } from "zod";

const SEARCH_PAGE_HASH_PARAM = "search";

// The search endpoints accept at most 100 IDs per filter.
const MAX_SELECTED_IDS = 100;

const searchPageHashSchema = z.object({
  tab: z.unknown().optional(),
  filter: z.record(z.unknown()).optional(),
});

const selectedIdsSchema = z.array(z.unknown());

export interface SearchPageHashState<
  Category extends SearchFilterCategory,
  TabId extends string,
> {
  tabId: TabId;
  selection: SearchFilterSelection<Category>;
}

// base64url of the UTF-8 bytes: the URL-safe alphabet needs no percent-encoding in the hash.
function toBase64Url(text: string): string {
  const binary = Array.from(new TextEncoder().encode(text), (byte) =>
    String.fromCharCode(byte)
  ).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  let binary: string;
  try {
    binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0))
  );
}

/**
 * @cc [owner:tdraier,label:react;security] parse-tolerates-untrusted-hash
 * The hash is user-controlled (shared links, manual edits): malformed base64 or JSON MUST yield
 * `defaultTabId` and no selection, an unknown tab MUST yield `defaultTabId`, and invalid IDs or
 * categories outside `categories` MUST be dropped individually without discarding the other
 * selections. Each category MUST keep at most 100 distinct IDs.
 */
export function parseSearchPageHash<
  Category extends SearchFilterCategory,
  TabId extends string,
>(
  value: string | undefined,
  categories: readonly Category[],
  tabIds: readonly TabId[],
  defaultTabId: TabId
): SearchPageHashState<Category, TabId> {
  const text = value ? fromBase64Url(value) : null;
  const json = text ? safeParseJSON(text) : null;
  const parsed = json?.isOk()
    ? searchPageHashSchema.safeParse(json.value)
    : null;
  if (!parsed?.success) {
    return { tabId: defaultTabId, selection: {} };
  }

  const selection: SearchFilterSelection<Category> = {};
  for (const category of categories) {
    const values = selectedIdsSchema.safeParse(parsed.data.filter?.[category]);
    const ids = [
      ...new Set(
        (values.success ? values.data : []).filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      ),
    ].slice(0, MAX_SELECTED_IDS);
    if (ids.length > 0) {
      selection[category] = ids;
    }
  }
  return {
    tabId: tabIds.find((tabId) => tabId === parsed.data.tab) ?? defaultTabId,
    selection,
  };
}

export function serializeSearchPageHash<
  Category extends SearchFilterCategory,
  TabId extends string,
>(
  { tabId, selection }: SearchPageHashState<Category, TabId>,
  defaultTabId: TabId
): string | undefined {
  const hasSelection = Object.values<string[] | undefined>(selection).some(
    (ids) => (ids?.length ?? 0) > 0
  );
  if (tabId === defaultTabId && !hasSelection) {
    return undefined;
  }
  return toBase64Url(
    JSON.stringify({
      ...(tabId !== defaultTabId ? { tab: tabId } : {}),
      ...(hasSelection ? { filter: selection } : {}),
    })
  );
}

// Persists the selected tab and the selected filter IDs in the URL hash. Option names come from
// the options applied in this session; the caller resolves the others (restored from a link)
// through `resolveFilter`, from the facets of `unresolvedCategories`.
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
  const [value, setValue] = useHashParam(SEARCH_PAGE_HASH_PARAM);
  const { tabId, selection } = useMemo(
    () => parseSearchPageHash(value, categories, tabIds, defaultTabId),
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
      serializeSearchPageHash({ tabId: nextTabId, selection }, defaultTabId)
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
      serializeSearchPageHash(
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
