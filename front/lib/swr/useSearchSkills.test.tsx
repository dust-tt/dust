import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import {
  useSearchSkills,
  useSearchSkillsInfinite,
} from "@app/lib/swr/skill_configurations";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();

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

describe("skill search selection modes", () => {
  it("keeps the favorites indicator with the displayed response while the next query loads", async () => {
    const { fetcherWithBody, wrapper } = setup();
    fetcherWithBody.mockResolvedValueOnce({
      skills: [],
      total: 0,
      hasMore: false,
      isFavoritesOnly: true,
      facets: {},
    });
    const { result, rerender } = renderHook(
      ({ searchTerm }) =>
        useSearchSkills({
          owner,
          searchTerm,
          selectionMode: "favorites_or_all",
        }),
      { wrapper, initialProps: { searchTerm: "" } }
    );
    await waitFor(() => expect(result.current.isFavoritesOnly).toBe(true));

    const pending = Promise.withResolvers<SearchSkillsResponseBody>();
    fetcherWithBody.mockReturnValueOnce(pending.promise);
    rerender({ searchTerm: "report" });
    await waitFor(() => expect(fetcherWithBody).toHaveBeenCalledTimes(2));
    expect(result.current.isFavoritesOnly).toBe(true);
    expect(result.current.resolvedSearchTerm).toBe("");

    await act(async () => {
      pending.resolve({
        skills: [],
        total: 0,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {},
      });
    });
    expect(result.current.isFavoritesOnly).toBe(false);
    expect(result.current.resolvedSearchTerm).toBe("report");
  });

  it("keeps favorites-only selection on every page and resets the offset when searching", async () => {
    const { fetcherWithBody, wrapper } = setup();
    fetcherWithBody
      .mockResolvedValueOnce({
        skills: [],
        total: 2,
        hasMore: true,
        isFavoritesOnly: true,
        facets: {},
      })
      .mockResolvedValue({
        skills: [],
        total: 2,
        hasMore: false,
        isFavoritesOnly: true,
        facets: {},
      });
    const { result, rerender } = renderHook(
      ({ searchTerm }) =>
        useSearchSkillsInfinite({
          owner,
          searchTerm,
          limit: 1,
          selectionMode: "favorites_only",
        }),
      { wrapper, initialProps: { searchTerm: "" } }
    );
    await waitFor(() => expect(result.current.isSkillsLoading).toBe(false));
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(fetcherWithBody).toHaveBeenCalledTimes(2));
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      { query: "", offset: 1, limit: 1, selectionMode: "favorites_only" },
      "POST",
    ]);

    rerender({ searchTerm: "report" });
    await waitFor(() => expect(fetcherWithBody).toHaveBeenCalledTimes(3));
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      { query: "report", offset: 0, limit: 1, selectionMode: "favorites_only" },
      "POST",
    ]);
    expect(result.current.isFavoritesOnly).toBe(true);
    expect(result.current.hasMore).toBe(false);
  });
});
