import { useDebounce } from "@app/hooks/useDebounce";
import {
  SEARCH_SKILLS_DEBOUNCE_MS,
  SEARCH_SKILLS_QUERY_MAX_LENGTH,
} from "@app/lib/swr/skill_configurations";
import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect } from "react";

/**
 * @cc [owner:aubin-tchoi,label:react] skill-search-infinite-pages
 * Pages accumulate for one query only. A new query starts at offset zero, and
 * pagination must not advance while disabled, loading, or showing a previous query.
 */
export function useSearchSkillsInfinite({
  owner,
  searchTerm,
  limit,
  disabled,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  limit: number;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const query = searchTerm.slice(0, SEARCH_SKILLS_QUERY_MAX_LENGTH);
  const { debouncedValue: debouncedSearchTerm, setValue: setSearchTerm } =
    useDebounce(query, { delay: SEARCH_SKILLS_DEBOUNCE_MS });
  const isDebouncing = query !== debouncedSearchTerm;

  useEffect(() => {
    setSearchTerm(query);
  }, [query, setSearchTerm]);

  const { data, error, size, setSize, isLoading, isValidating } =
    useSWRInfiniteWithDefaults(
      (pageIndex: number, previousPage: SearchSkillsResponseBody | null) => {
        if (previousPage && !previousPage.hasMore) {
          return null;
        }

        return [
          `/api/w/${owner.sId}/skills/search`,
          { query: debouncedSearchTerm, offset: pageIndex * limit, limit },
        ] as const;
      },
      async ([url, body]) => {
        const response: SearchSkillsResponseBody = await fetcherWithBody([
          url,
          body,
          "POST",
        ]);
        return { ...response, searchTerm: body.query };
      },
      {
        disabled: disabled || isDebouncing,
        revalidateFirstPage: false,
        // Keep the current list visible while the next query debounces or loads.
        keepPreviousData: true,
      }
    );

  const hasMore = data?.at(-1)?.hasMore ?? false;
  const isSkillsLoading =
    !disabled &&
    (isDebouncing ||
      isLoading ||
      isValidating ||
      (!error && size > (data?.length ?? 0)));
  const loadMore = useCallback(() => {
    if (
      !disabled &&
      !isSkillsLoading &&
      !error &&
      hasMore &&
      data?.[0]?.searchTerm === query
    ) {
      void setSize(size + 1);
    }
  }, [disabled, isSkillsLoading, error, hasMore, data, query, setSize, size]);

  return {
    skills:
      (disabled ? undefined : data?.flatMap((page) => page.skills)) ??
      emptyArray<SkillListItemType>(),
    resolvedSearchTerm: disabled ? null : (data?.[0]?.searchTerm ?? null),
    isSkillsLoading,
    hasMore,
    loadMore,
  };
}
