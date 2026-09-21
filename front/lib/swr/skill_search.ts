import { useFetcher } from "@app/lib/swr/FetcherContext";
import { emptyArray, useSWRInfiniteWithDefaults } from "@app/lib/swr/swr";
import type {
  SearchSkillsResponseBody,
  SkillSearchFilters,
  SkillSearchSort,
} from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";

const SKILL_SEARCH_PAGE_SIZE = 50;
const SKILL_SEARCH_QUERY_MAX_LENGTH = 200;

export function useInfiniteSkillSearch({
  owner,
  searchTerm,
  filters,
  disabled,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  filters: SkillSearchFilters;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const sortBy: SkillSearchSort = searchTerm.trim() ? "relevance" : "usage";
  const body = {
    query: searchTerm.slice(0, SKILL_SEARCH_QUERY_MAX_LENGTH),
    sortBy,
    limit: SKILL_SEARCH_PAGE_SIZE,
    ...filters,
  };
  const { data, error, isLoading, isValidating, size, setSize, mutate } =
    useSWRInfiniteWithDefaults<
      [string, typeof body & { cursor?: string | null }] | null,
      SearchSkillsResponseBody
    >(
      (_pageIndex, previousPage) => {
        if (previousPage && !previousPage.hasMore) {
          return null;
        }
        return [
          `/api/w/${owner.sId}/skills/search`,
          { ...body, cursor: previousPage?.nextCursor },
        ];
      },
      ([url, request]) => fetcherWithBody([url, request, "POST"]),
      { disabled, revalidateFirstPage: false }
    );

  return {
    skills: data?.flatMap((page) => page.skills) ?? emptyArray(),
    editors: data?.flatMap((page) => page.editors) ?? emptyArray(),
    hasMore: data?.at(-1)?.hasMore ?? false,
    isLoading: !disabled && (isLoading || (!data && isValidating)),
    isLoadingMore:
      !disabled && !error && isValidating && (data?.length ?? 0) < size,
    isError: !!error,
    loadMore: () => setSize(size + 1),
    mutate,
  };
}
