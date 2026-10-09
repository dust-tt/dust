import {
  buildCatalogQuery,
  getItemId,
} from "@app/components/assistant/conversation/discover/catalog";
import { useCatalogSearch } from "@app/lib/swr/catalog_search";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import type { SkillListItemType } from "@app/types/assistant/skill_configuration";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();
const agent: SearchAgentsResponseBody["agents"][number] = {
  sId: "agent-1",
  name: "Weekly report",
  description: "Writes reports",
  status: "active",
  scope: "visible",
  pictureUrl: "https://dust.tt/static/droidavatar/Droid_Yellow_1.jpg",
  model: {
    providerId: "anthropic",
    modelId: "claude-sonnet-5",
    reasoningEffort: "medium",
  },
  feedbacks: { up: 0, down: 0 },
  tags: [],
  tagIds: [],
  requestedSpaceIds: [],
  editorIds: [],
  editors: [],
  editedBy: null,
  activeUsersCount: null,
  updatedAt: 0,
  userFavorite: false,
};
const skill: SkillListItemType = {
  sId: "skill-1",
  name: "Report summary",
  userFacingDescription: "Summarizes reports",
  status: "active",
  icon: null,
  requestedSpaceIds: [],
  mcpServerViewIds: [],
  editorIds: [],
  editors: [],
  editedBy: null,
  availability: "workspace_users",
  activeUsersCount: null,
  updatedAt: 0,
  canWrite: false,
  canAdministrate: false,
};

function setup() {
  const fetcherWithBody = vi.fn<FetcherWithBodyFn>();
  const swrConfig = { provider: () => new Map(), shouldRetryOnError: false };
  const wrapper = ({ children }: PropsWithChildren) => (
    <SWRConfig value={swrConfig}>
      <FetcherProvider fetcher={vi.fn()} fetcherWithBody={fetcherWithBody}>
        {children}
      </FetcherProvider>
    </SWRConfig>
  );
  return { fetcherWithBody, wrapper };
}

describe("catalog favorite search", () => {
  it("searches both sources, paginates them independently and resets on query changes", async () => {
    const { fetcherWithBody, wrapper } = setup();
    fetcherWithBody
      .mockResolvedValueOnce({ agents: [agent], hasMore: true })
      .mockResolvedValueOnce({ skills: [skill], hasMore: false })
      .mockResolvedValueOnce({
        agents: [{ ...agent, sId: "agent-2" }],
        hasMore: false,
      });
    const { result, rerender } = renderHook(
      ({ searchTerm }) =>
        useCatalogSearch({
          owner,
          query: buildCatalogQuery(
            { view: "favorites", kind: "all", tagId: null },
            searchTerm
          ),
        }),
      { wrapper, initialProps: { searchTerm: "report" } }
    );
    await waitFor(() =>
      expect(result.current.items.map(getItemId)).toEqual([
        "agent-1",
        "skill-1",
      ])
    );
    for (const endpoint of [
      "assistant/agent_configurations/search",
      "skills/search",
    ]) {
      expect(fetcherWithBody).toHaveBeenCalledWith([
        `/api/w/${owner.sId}/${endpoint}`,
        expect.objectContaining({
          selectionMode: "favorites_only",
          query: "report",
          offset: 0,
          sortBy: "relevance",
        }),
        "POST",
      ]);
    }

    await act(async () => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.items.map(getItemId)).toEqual([
        "agent-1",
        "skill-1",
        "agent-2",
      ])
    );
    expect(fetcherWithBody).toHaveBeenCalledTimes(3);
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/assistant/agent_configurations/search`,
      expect.objectContaining({
        selectionMode: "favorites_only",
        query: "report",
        offset: 1,
      }),
      "POST",
    ]);
    expect(result.current.hasMore).toBe(false);

    fetcherWithBody
      .mockResolvedValueOnce({ agents: [], hasMore: false })
      .mockResolvedValueOnce({ skills: [], hasMore: false });
    rerender({ searchTerm: "sales" });
    await waitFor(() =>
      expect(result.current.itemsQuery.searchTerm).toBe("sales")
    );
    expect(result.current.items).toEqual([]);
    expect(fetcherWithBody).toHaveBeenCalledTimes(5);
    for (const [[, body]] of fetcherWithBody.mock.calls.slice(3)) {
      expect(body).toMatchObject({
        selectionMode: "favorites_only",
        query: "sales",
        offset: 0,
      });
    }
  });

  it("refreshes favorites when revalidating after a details-sheet change", async () => {
    const { fetcherWithBody, wrapper } = setup();
    fetcherWithBody
      .mockResolvedValueOnce({ agents: [agent], hasMore: false })
      .mockResolvedValueOnce({ skills: [skill], hasMore: false });
    const { result } = renderHook(
      () =>
        useCatalogSearch({
          owner,
          query: buildCatalogQuery(
            { view: "favorites", kind: "all", tagId: null },
            ""
          ),
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    fetcherWithBody
      .mockResolvedValueOnce({ agents: [], hasMore: false })
      .mockResolvedValueOnce({ skills: [], hasMore: false });

    await act(async () => {
      await result.current.mutate();
    });
    expect(result.current.items).toEqual([]);
    expect(fetcherWithBody).toHaveBeenCalledTimes(4);
    for (const [[, body]] of fetcherWithBody.mock.calls) {
      expect(body).toMatchObject({
        selectionMode: "favorites_only",
        query: "",
        sortBy: "relevance",
      });
    }
  });

  it("keeps ordinary catalog searches unrestricted by favorites", async () => {
    const { fetcherWithBody, wrapper } = setup();
    fetcherWithBody
      .mockResolvedValueOnce({ agents: [], hasMore: false })
      .mockResolvedValueOnce({ skills: [], hasMore: false });
    const { result } = renderHook(
      () =>
        useCatalogSearch({
          owner,
          query: buildCatalogQuery(
            { view: "all", kind: "all", tagId: null },
            ""
          ),
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetcherWithBody).toHaveBeenCalledTimes(2);
    for (const [[, body]] of fetcherWithBody.mock.calls) {
      expect(body).toMatchObject({ selectionMode: "all", sortBy: "name" });
    }
  });
});
