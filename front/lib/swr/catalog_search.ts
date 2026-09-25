import type {
  CatalogItem,
  CatalogQuery,
} from "@app/components/assistant/conversation/discover/catalog";
import {
  deduplicateCatalogItems,
  interleaveCatalogItems,
  toSearchAgentCatalogItem,
  toSearchSkillCatalogItem,
} from "@app/components/assistant/conversation/discover/catalog";
import { useFetcher, useSWRInfiniteWithDefaults } from "@app/lib/swr/swr";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";

interface CatalogPage {
  items: CatalogItem[];
  next: {
    agents: number | null;
    skills: number | null;
  };
}

interface SourceRequest {
  offset: number;
}

export interface CatalogPageRequest {
  query: CatalogQuery;
  agents: SourceRequest | null;
  skills: SourceRequest | null;
}

type CatalogPageKey = [
  "catalog-search",
  workspaceId: string,
  request: CatalogPageRequest,
];

export function getCatalogPageRequest(
  query: CatalogQuery,
  previousPage: CatalogPage | null
): CatalogPageRequest | null {
  const firstPage = previousPage === null;
  const agents = firstPage
    ? query.showAgents
      ? { offset: 0 }
      : null
    : previousPage.next.agents !== null
      ? { offset: previousPage.next.agents }
      : null;
  const skills = firstPage
    ? query.showSkills
      ? { offset: 0 }
      : null
    : previousPage.next.skills !== null
      ? { offset: previousPage.next.skills }
      : null;

  return agents || skills ? { query, agents, skills } : null;
}

/**
 * @cc [owner:frankaloia,label:react;product] catalog-search-pagination
 * Agent and skill offsets MUST advance independently within one catalog page. A source with
 * no next offset MUST NOT be fetched again, while pages already returned by SWR remain visible.
 */
export function useCatalogSearch({
  owner,
  query,
}: {
  owner: LightWorkspaceType;
  query: CatalogQuery;
}) {
  const { fetcherWithBody } = useFetcher();

  const getKey = useCallback(
    (_pageIndex: number, previousPage: CatalogPage | null) => {
      const request = getCatalogPageRequest(query, previousPage);
      return request
        ? (["catalog-search", owner.sId, request] satisfies CatalogPageKey)
        : null;
    },
    [owner.sId, query]
  );

  const fetchPage = useCallback(
    async ([, workspaceId, request]: CatalogPageKey): Promise<CatalogPage> => {
      const agentOffset = request.agents?.offset;
      const skillOffset = request.skills?.offset;
      const agentsPromise: Promise<SearchAgentsResponseBody | null> =
        agentOffset === undefined
          ? Promise.resolve(null)
          : fetcherWithBody([
              `/api/w/${workspaceId}/assistant/agent_configurations/search`,
              {
                ...request.query.agentFilters,
                query: request.query.searchTerm,
                offset: agentOffset,
                limit: request.query.limit,
                sortBy: request.query.sortBy,
                sortOrder: request.query.sortOrder,
              },
              "POST",
            ]);
      const skillsPromise: Promise<SearchSkillsResponseBody | null> =
        skillOffset === undefined
          ? Promise.resolve(null)
          : fetcherWithBody([
              `/api/w/${workspaceId}/skills/search`,
              {
                ...request.query.skillFilters,
                query: request.query.searchTerm,
                offset: skillOffset,
                limit: request.query.limit,
                sortBy: request.query.sortBy,
                sortOrder: request.query.sortOrder,
              },
              "POST",
            ]);

      const [agents, skills] = await Promise.all([
        agentsPromise,
        skillsPromise,
      ]);

      return {
        items: interleaveCatalogItems(
          agents?.agents.map(toSearchAgentCatalogItem) ?? [],
          skills?.skills.map(toSearchSkillCatalogItem) ?? []
        ),
        next: {
          agents:
            agents?.hasMore && agentOffset !== undefined
              ? agentOffset + agents.agents.length
              : null,
          skills:
            skills?.hasMore && skillOffset !== undefined
              ? skillOffset + skills.skills.length
              : null,
        },
      };
    },
    [fetcherWithBody]
  );

  const { data, error, isLoading, isValidating, size, setSize } =
    useSWRInfiniteWithDefaults<CatalogPageKey | null, CatalogPage>(
      getKey,
      fetchPage,
      {
        revalidateAll: false,
        revalidateFirstPage: false,
        revalidateOnFocus: false,
      }
    );

  const items = useMemo(
    () => deduplicateCatalogItems(data?.flatMap((page) => page.items) ?? []),
    [data]
  );
  const lastPage = data?.[data.length - 1];
  const hasMore = Boolean(
    lastPage?.next.agents ?? lastPage?.next.skills ?? false
  );
  const loadMore = useCallback(() => {
    if (hasMore && !isValidating) {
      void setSize(size + 1);
    }
  }, [hasMore, isValidating, setSize, size]);

  return {
    items,
    hasMore,
    isLoading,
    isLoadingMore: isValidating && items.length > 0,
    hasError: Boolean(error),
    loadMore,
  };
}
