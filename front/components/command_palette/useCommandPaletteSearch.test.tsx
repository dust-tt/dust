import { useCommandPaletteSearch } from "@app/components/command_palette/useCommandPaletteSearch";
import type { FetcherFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false }),
  useWorkspace: () => owner,
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));

it("hides previous-query results immediately while the next query debounces", async () => {
  const fetcher = vi.fn<FetcherFn>(async (url) => {
    const parsed = new URL(url, "http://localhost");
    const query = parsed.searchParams.get("query");
    if (parsed.pathname.endsWith("/members/search")) {
      const searchTerm = parsed.searchParams.get("searchTerm");
      return { members: [{ sId: `member-${searchTerm}` }], total: 10 };
    }
    if (parsed.pathname.endsWith("/search_projects")) {
      return { spaces: [{ sId: `pod-${query}` }], hasMore: true };
    }
    const kind = parsed.pathname.endsWith("/semantic_search")
      ? "semantic"
      : "private";
    return {
      conversations: [{ sId: `${kind}-${query}`, spaceName: null }],
      hasMore: true,
    };
  });
  const fetcherWithBody = vi.fn().mockResolvedValue({ agents: [], skills: [] });
  const cache = new Map();
  const { result, rerender } = renderHook(
    ({ query }) =>
      useCommandPaletteSearch({
        owner,
        isOpen: true,
        searchQuery: query,
        currentUserId: "current-user",
      }),
    {
      initialProps: { query: "old" },
      wrapper: ({ children }: { children: ReactNode }) => (
        <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
          <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
            {children}
          </FetcherProvider>
        </SWRConfig>
      ),
    }
  );

  await waitFor(() => {
    expect(result.current.conversations.map((c) => c.sId)).toEqual([
      "private-old",
      "semantic-old",
    ]);
    expect(result.current.pods.map((p) => p.sId)).toEqual(["pod-old"]);
    expect(result.current.members.map((m) => m.sId)).toEqual(["member-old"]);
  });

  rerender({ query: "new" });

  expect(result.current.conversations).toEqual([]);
  expect(result.current.pods).toEqual([]);
  expect(result.current.members).toEqual([]);
  expect(result.current.hasMoreConversations).toBe(false);
  expect(result.current.hasMorePods).toBe(false);
  expect(result.current.hasMoreMembers).toBe(false);
  expect(result.current.isLoading).toBe(true);

  await waitFor(() => {
    expect(result.current.conversations.map((c) => c.sId)).toEqual([
      "private-new",
      "semantic-new",
    ]);
    expect(result.current.pods.map((p) => p.sId)).toEqual(["pod-new"]);
    expect(result.current.members.map((m) => m.sId)).toEqual(["member-new"]);
  });
});
